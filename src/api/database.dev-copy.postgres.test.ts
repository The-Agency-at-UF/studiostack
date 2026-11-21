// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { createDatabase } from '../../backend/database/client'
import { loadMigrations } from '../../backend/database/migrations'
import { replaceWithProductionCopy } from '../../backend/database/dev-copy'

const connectionString = process.env.DATABASE_API_TEST_URL
const integration = connectionString ? describe : describe.skip
type Database = ReturnType<typeof createDatabase>
const wrap = (client: pg.Client) => ({ transaction: async <T>(operation: (c: pg.Client) => Promise<T>) => {
  await client.query('BEGIN')
  try { const result = await operation(client); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK'); throw error }
} }) as unknown as Database
const devIssuer = 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_devPool1'
const devSubject = '11111111-2222-4333-8444-555555555555'

integration('real PostgreSQL: production copy into dev', () => {
  let operator: pg.Client, source: pg.Client, target: pg.Client, createdRole = false
  const suffix = randomUUID().slice(0, 8), databases = [`studiostack_devcopy_source_${suffix}`, `studiostack_devcopy_target_${suffix}`]
  const connect = async (database: string) => { const url = new URL(connectionString!); url.pathname = '/' + database; const c = new pg.Client({ connectionString: url.toString() }); await c.connect(); return c }
  const migrate = async (client: pg.Client) => { await client.query('CREATE SCHEMA app'); await client.query('CREATE TABLE app.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const m of await loadMigrations()) { await client.query(m.sql); await client.query('INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum]) } }
  const org = randomUUID(), owner = randomUUID(), member = randomUUID()

  beforeAll(async () => {
    const url = new URL(connectionString!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/studiostack_api_test') throw new Error('Integration tests require a disposable localhost studiostack_api_test database')
    operator = new pg.Client({ connectionString }); await operator.connect()
    for (const name of databases) await operator.query(`CREATE DATABASE ${name}`)
    // Roles are cluster-wide and other suites create this one themselves: add it only if absent, and remove only what this suite added.
    createdRole = !(await operator.query("SELECT 1 FROM pg_roles WHERE rolname = 'studiostack_dev_app'")).rows.length
    if (createdRole) await operator.query('CREATE ROLE "studiostack_dev_app" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
    source = await connect(databases[0]); target = await connect(databases[1])
    await migrate(source)
    await source.query("INSERT INTO app.users (id, cognito_issuer, cognito_subject, email, display_name) VALUES ($1, 'https://prod.issuer', 'prod-owner', 'owner@ufl.edu', 'Owner'), ($2, 'https://prod.issuer', 'prod-member', 'student@ufl.edu', 'Student')", [owner, member])
    await source.query("INSERT INTO app.organizations (id, slug, name) VALUES ($1, 'agency', 'Agency')", [org])
    await source.query("INSERT INTO app.organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')", [org, owner, member])
    await source.query("INSERT INTO app.organization_invitations (organization_id, email, display_name, role, created_by, request_id, request_hash) VALUES ($1, 'invitee@gmail.com', 'Invitee', 'member', $2, $3, $4)", [org, owner, randomUUID(), 'b'.repeat(64)])
    await source.query("INSERT INTO app.organization_audit_events (organization_id, actor_id, kind, details, request_id, request_hash) VALUES ($1, $2, 'invite', $3, $4, $5)", [org, owner, JSON.stringify({ to: 'Invitee@Gmail.com', cc: ['student@ufl.edu', 'owner@ufl.edu'] }), randomUUID(), 'c'.repeat(64)])
    await source.query("INSERT INTO app.user_alerts (organization_id, recipient_id, kind, title, message, target_path, dedupe_key, email_status) VALUES ($1, $2, 'report_update', 'Update', 'Reply to student@ufl.edu or bstudent@ufl.edu', $3, 'k1', 'pending')", [org, member, `/report-summary/?report=${randomUUID()}`])

    // Dev is ahead of production and holds its own data; all of it is replaced.
    await migrate(target)
    await target.query("INSERT INTO app.schema_migrations (name, checksum) VALUES ('999_dev_only.sql', 'x')")
    await target.query('CREATE TABLE app.dev_only (id int)')
    await target.query("INSERT INTO app.users (cognito_issuer, cognito_subject, email) VALUES ($1, $2, 'owner@ufl.edu')", [devIssuer, devSubject])
  })
  afterAll(async () => {
    await source?.end(); await target?.end()
    for (const name of databases) await operator?.query(`DROP DATABASE IF EXISTS ${name}`)
    if (createdRole) await operator?.query('DROP ROLE IF EXISTS "studiostack_dev_app"')
    await operator?.end()
  })

  it('refuses a build missing a production migration and leaves dev unchanged', async () => {
    await source.query("INSERT INTO app.schema_migrations (name, checksum) VALUES ('998_prod_only.sql', 'y')")
    await expect(replaceWithProductionCopy(wrap(source), wrap(target), { issuer: devIssuer, keep: [] })).rejects.toThrow(/lacks production migrations 998_prod_only\.sql/)
    await source.query("DELETE FROM app.schema_migrations WHERE name = '998_prod_only.sql'")
    expect((await target.query("SELECT to_regclass('app.dev_only') AS t")).rows[0].t).toBe('app.dev_only')
  })

  it('replaces dev with production at production\'s migrations, masks emails, links kept logins and stops unsent email', async () => {
    const result = await replaceWithProductionCopy(wrap(source), wrap(target), { issuer: devIssuer, keep: [{ email: 'Owner@ufl.edu', subject: devSubject }, { email: 'bstudent@ufl.edu' }] })
    // The queued invitation and the pending alert.
    expect(result).toMatchObject({ ok: true, linked: 1, stoppedDeliveries: 2 })
    expect(result.counts).toMatchObject({ users: 2, organizations: 1, organization_memberships: 2, organization_invitations: 1 })
    expect((await target.query("SELECT to_regclass('app.dev_only') AS t")).rows[0].t).toBeNull()
    const migrations = async (c: pg.Client) => (await c.query('SELECT name, checksum FROM app.schema_migrations ORDER BY name')).rows
    expect(await migrations(target)).toEqual(await migrations(source))

    const { rows: users } = await target.query('SELECT id, cognito_issuer, cognito_subject, email FROM app.users ORDER BY display_name')
    expect(users[0]).toEqual({ id: owner, cognito_issuer: devIssuer, cognito_subject: devSubject, email: 'owner@ufl.edu' })
    expect(users[1]).toMatchObject({ id: member, cognito_issuer: devIssuer, email: expect.stringMatching(/^u-[a-f0-9]{16}@example\.invalid$/) })
    expect(users[1].cognito_subject).toMatch(/^prod-copy-[a-f0-9]{32}$/)
    const masked = users[1].email

    const { rows: [invite] } = await target.query('SELECT email, delivery_status, lease_token FROM app.organization_invitations')
    expect(invite).toEqual({ email: expect.stringMatching(/@example\.invalid$/), delivery_status: 'failed', lease_token: null })
    const { rows: [audit] } = await target.query('SELECT details FROM app.organization_audit_events')
    expect(audit.details).toEqual({ to: invite.email, cc: [masked, 'owner@ufl.edu'] })
    const { rows: [alert] } = await target.query('SELECT message, email_status FROM app.user_alerts')
    expect(alert.email_status).toBe('suppressed')
    expect(alert.message).toBe(`Reply to ${masked} or bstudent@ufl.edu`)
    expect(JSON.stringify(await target.query('SELECT * FROM app.users')).includes('student@ufl.edu')).toBe(false)

    // Source is only read.
    expect((await source.query("SELECT email FROM app.users WHERE id = $1", [member])).rows[0].email).toBe('student@ufl.edu')
    expect((await source.query('SELECT email_status FROM app.user_alerts')).rows[0].email_status).toBe('pending')
  })

  it('leaves the restricted dev role with its grants on the rebuilt schema', async () => {
    const { rows: [grant] } = await target.query("SELECT has_schema_privilege('studiostack_dev_app', 'app', 'USAGE') AS usage")
    expect(grant.usage).toBe(true)
  })
})
