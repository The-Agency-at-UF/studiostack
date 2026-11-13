// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { createDatabase } from '../../backend/database/client'
import { loadMigrations } from '../../backend/database/migrations'
import { databaseApiGrants } from '../../backend/database/api-grants'
import { appTables, copyAppData, digestAppData, digestDifferences, prepareRdsLogin } from '../../backend/database/rds-copy'

const connectionString = process.env.DATABASE_API_TEST_URL
const integration = connectionString ? describe : describe.skip
type Database = ReturnType<typeof createDatabase>
const wrap = (client: pg.Client) => ({ transaction: async <T>(operation: (c: pg.Client) => Promise<T>) => {
  await client.query('BEGIN')
  try { const result = await operation(client); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK'); throw error }
} }) as unknown as Database

integration('real PostgreSQL: Aurora to RDS copy', () => {
  let operator: pg.Client, source: pg.Client, target: pg.Client
  const suffix = randomUUID().slice(0, 8), databases = [`studiostack_rds_source_${suffix}`, `studiostack_rds_target_${suffix}`]
  const connect = async (database: string) => { const url = new URL(connectionString!); url.pathname = '/' + database; const c = new pg.Client({ connectionString: url.toString() }); await c.connect(); return c }
  const migrate = async (client: pg.Client) => { await client.query('CREATE TABLE app.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())').catch(() => undefined)
    for (const m of await loadMigrations()) { await client.query(m.sql); await client.query('INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum]) } }

  beforeAll(async () => {
    const url = new URL(connectionString!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/studiostack_api_test') throw new Error('Integration tests require a disposable localhost studiostack_api_test database')
    operator = new pg.Client({ connectionString }); await operator.connect()
    for (const name of databases) await operator.query(`CREATE DATABASE ${name}`)
    // Stand-in for RDS's built-in IAM role; vanilla PostgreSQL has none.
    await operator.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_iam') THEN CREATE ROLE rds_iam NOLOGIN; END IF; END $$")
    source = await connect(databases[0]); target = await connect(databases[1])
    await source.query('CREATE SCHEMA app'); await migrate(source)
    const org = randomUUID(), user = randomUUID(), item = randomUUID(), reservation = randomUUID()
    await source.query("INSERT INTO app.users (id, cognito_issuer, cognito_subject, email, display_name) VALUES ($1, 'https://issuer.test', 'subject-1', 'person@example.test', 'Synthetic Person')", [user])
    await source.query("INSERT INTO app.organizations (id, slug, name) VALUES ($1, 'copy-test', 'Copy Test')", [org])
    await source.query("INSERT INTO app.organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')", [org, user])
    for (let i = 0; i < 1200; i++) await source.query("INSERT INTO app.inventory (organization_id, equipment_code, name, category) VALUES ($1, $2, $3, 'Lights')", [org, `L-${i}`, `Light ${i}`])
    await source.query("INSERT INTO app.inventory (id, organization_id, equipment_code, name, category) VALUES ($1, $2, 'CAM-1', 'Camera', 'Camera & Accessories')", [item, org])
    await source.query("INSERT INTO app.reservations (id, organization_id, user_id, name, starts_at, ends_at, request_id, request_hash) VALUES ($1, $2, $3, 'Shoot', '2026-11-20T15:00:00Z', '2026-11-21T15:00:00Z', $4, $5)", [reservation, org, user, randomUUID(), 'a'.repeat(64)])
    await source.query('INSERT INTO app.reservation_items (organization_id, reservation_id, equipment_id) VALUES ($1, $2, $3)', [org, reservation, item])
  })
  afterAll(async () => {
    await source?.end(); await target?.end()
    for (const name of databases) await operator?.query(`DROP DATABASE IF EXISTS ${name}`)
    await operator?.end()
  })

  it('creates an IAM-only app login before the schema and grants', async () => {
    expect(await prepareRdsLogin(wrap(target), 'prod')).toMatchObject({ ok: true, role: 'studiostack_prod_app' })
    expect((await prepareRdsLogin(wrap(target), 'prod')).created).toBe(false)
    const { rows: [role] } = await target.query("SELECT rolcanlogin, rolsuper, rolconnlimit, rolpassword IS NULL AS no_password, pg_has_role('studiostack_prod_app', 'rds_iam', 'MEMBER') AS iam FROM pg_authid WHERE rolname = 'studiostack_prod_app'")
    expect(role).toEqual({ rolcanlogin: true, rolsuper: false, rolconnlimit: 5, no_password: true, iam: true })
    await target.query('CREATE SCHEMA app'); await migrate(target); await target.query(databaseApiGrants('prod'))
  })
  it('orders parents before children', async () => {
    const tables = await appTables(source)
    expect(tables.indexOf('organizations')).toBeLessThan(tables.indexOf('inventory'))
    expect(tables.indexOf('reservations')).toBeLessThan(tables.indexOf('reservation_items'))
    expect(tables).not.toContain('schema_migrations')
  })
  it('copies every row in batches and the digests match exactly', async () => {
    const before = await digestAppData(wrap(target))
    expect(digestDifferences(await digestAppData(wrap(source)), before).tables).toEqual(expect.arrayContaining(['inventory', 'users']))
    const result = await copyAppData(wrap(source), wrap(target))
    expect(result.counts).toMatchObject({ inventory: 1201, users: 1, organizations: 1, reservations: 1, reservation_items: 1 })
    const differences = digestDifferences(await digestAppData(wrap(source)), await digestAppData(wrap(target)))
    expect(differences).toEqual({ migrations: false, tables: [] })
  })
  it('refuses to copy into a database that already has data, and changes nothing', async () => {
    const before = await digestAppData(wrap(target))
    await expect(copyAppData(wrap(source), wrap(target))).rejects.toThrow('already has application data')
    expect(digestDifferences(before, await digestAppData(wrap(target)))).toEqual({ migrations: false, tables: [] })
  })
})
