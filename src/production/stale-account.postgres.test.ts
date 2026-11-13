// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import type { createDatabase } from '../../backend/database/client'
import type { DatabaseConfig } from '../../backend/database/config'
import { loadMigrations } from '../../backend/database/migrations'
import { retireStaleAccount } from '../../backend/production/stale-account'

const connectionString = process.env.DATABASE_API_TEST_URL
const integration = connectionString ? describe : describe.skip
const wrap = (client: pg.Client) => ({ transaction: async <T>(operation: (c: pg.Client) => Promise<T>) => {
  await client.query('BEGIN')
  try { const result = await operation(client); await client.query('COMMIT'); return result } catch (error) { await client.query('ROLLBACK'); throw error }
} }) as unknown as ReturnType<typeof createDatabase>
const pool = 'us-east-2_test', issuer = `https://cognito-idp.us-east-2.amazonaws.com/${pool}`, email = 'rmckenzie1@ufl.edu'
const prod = { environment: 'prod' } as DatabaseConfig

integration('real PostgreSQL: retiring a stale account that holds a live sign-in\'s email', () => {
  let operator: pg.Client, db: pg.Client
  const name = `studiostack_stale_${randomUUID().slice(0, 8)}`
  let live: string, stale: string, liveSubject: string, staleSubject: string, agency: string, other: string
  const membership = async (org: string, user: string) => (await db.query('SELECT role,status FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2', [org, user])).rows[0]
  const emailOf = async (user: string) => (await db.query('SELECT email FROM app.users WHERE id=$1', [user])).rows[0].email

  beforeAll(async () => {
    const url = new URL(connectionString!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/studiostack_api_test') throw new Error('Integration tests require a disposable localhost studiostack_api_test database')
    operator = new pg.Client({ connectionString }); await operator.connect(); await operator.query(`CREATE DATABASE ${name}`)
    url.pathname = '/' + name; db = new pg.Client({ connectionString: url.toString() }); await db.connect()
    await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rds_iam') THEN CREATE ROLE rds_iam NOLOGIN; END IF; END $$")
    await db.query('CREATE SCHEMA app')
    await db.query('CREATE TABLE app.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())').catch(() => undefined)
    for (const m of await loadMigrations()) { await db.query(m.sql); await db.query('INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, m.checksum]) }
  })
  afterAll(async () => { await db?.end(); await operator?.query(`DROP DATABASE IF EXISTS ${name}`); await operator?.end() })
  beforeEach(async () => {
    vi.stubEnv('COGNITO_USER_POOL_ID', pool); vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP', 'yes')
    await db.query('TRUNCATE app.organization_audit_events, app.organization_memberships, app.organizations, app.users CASCADE')
    liveSubject = randomUUID(); staleSubject = randomUUID(); agency = randomUUID(); other = randomUUID()
    // The stale account kept the email; the live sign-in's account registered without one.
    stale = (await db.query('INSERT INTO app.users (cognito_issuer,cognito_subject,email,display_name) VALUES ($1,$2,$3,$4) RETURNING id', [issuer, staleSubject, email, 'Roger McKenzie'])).rows[0].id
    live = (await db.query('INSERT INTO app.users (cognito_issuer,cognito_subject,display_name) VALUES ($1,$2,$3) RETURNING id', [issuer, liveSubject, 'Roger'])).rows[0].id
    await db.query("INSERT INTO app.organizations (id,slug,name) VALUES ($1,'agency-uf','The Agency at UF'),($2,'other','Other')", [agency, other])
    await db.query("INSERT INTO app.organization_memberships (organization_id,user_id,role,status) VALUES ($1,$2,'owner','active'),($1,$3,'owner','active'),($4,$2,'admin','active')", [agency, stale, live, other])
  })
  afterEach(() => vi.unstubAllEnvs())

  it('only reports the plan until the stale sign-in is confirmed gone', async () => {
    const plan = await retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email } })
    expect(plan).toMatchObject({ ok: true, changed: false, liveAccount: live, staleAccount: stale, staleSubject })
    expect(await emailOf(stale)).toBe(email); expect(await membership(agency, stale)).toEqual({ role: 'owner', status: 'active' })
    await expect(retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email }, staleSubject: randomUUID(), apply: true })).rejects.toThrow('Confirm the stale sign-in')
    expect(await emailOf(stale)).toBe(email)
  })

  it('moves the email to the live account and suspends every stale membership, keeping an owner', async () => {
    const result = await retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email }, staleSubject, apply: true })
    expect(result).toMatchObject({ ok: true, changed: true, staleAccount: stale })
    expect(await emailOf(live)).toBe(email); expect(await emailOf(stale)).toBeNull()
    expect(await membership(agency, stale)).toEqual({ role: 'member', status: 'suspended' })
    expect(await membership(other, stale)).toEqual({ role: 'member', status: 'suspended' })
    expect(await membership(agency, live)).toEqual({ role: 'owner', status: 'active' })
    const audits = (await db.query('SELECT organization_id,actor_id,target_id,details FROM app.organization_audit_events ORDER BY organization_id')).rows
    expect(audits).toHaveLength(2)
    expect(audits.find(a => a.organization_id === agency)).toMatchObject({ actor_id: live, target_id: stale, details: { reason: 'stale-sign-in-retired', fromRole: 'owner' } })
    // The live account is not in the other organization, so the stale account records its own retirement there.
    expect(audits.find(a => a.organization_id === other)).toMatchObject({ actor_id: stale, target_id: stale })
    // Running it again finds nothing left to repair.
    expect(await retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email }, staleSubject, apply: true })).toMatchObject({ changed: false, staleAccount: null, liveHasEmail: true })
  })

  it('rolls back everything when the stale account is the only active owner somewhere', async () => {
    await db.query("UPDATE app.organization_memberships SET role='owner' WHERE organization_id=$1 AND user_id=$2", [other, stale])
    await expect(retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email }, staleSubject, apply: true })).rejects.toThrow('active organization owner')
    expect(await emailOf(stale)).toBe(email); expect(await emailOf(live)).toBeNull()
    expect(await membership(agency, stale)).toEqual({ role: 'owner', status: 'active' })
  })

  it('refuses other addresses, a live sign-in without an account, and production without approval', async () => {
    await expect(retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email: 'someone@ufl.edu' } })).rejects.toThrow('Approved')
    await expect(retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: randomUUID(), email } })).rejects.toThrow('no account')
    vi.stubEnv('ALLOW_PRODUCTION_OWNER_BOOTSTRAP', '')
    await expect(retireStaleAccount(wrap(db), prod, { action: 'retire-stale-account', current: { subject: liveSubject, email }, staleSubject, apply: true })).rejects.toThrow('Approved')
    expect(await emailOf(stale)).toBe(email)
  })
})
