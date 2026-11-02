// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { databaseConfig } from '../../backend/database/config'
import { createDatabase, DatabaseUnavailableError, parseCredentials } from '../../backend/database/client'
import type { DatabaseClient, DatabaseDependencies } from '../../backend/database/client'
import { applyMigrations, loadMigrations, migrationOptions } from '../../backend/database/migrations'
import { createDatabaseHandler } from '../../backend/database/handler'

const env = {
  STUDIOSTACK_ENV: 'dev', AWS_REGION: 'us-east-2', RDS_AWS_ACCOUNT_ID: '111122223333',
  RDS_HOST: 'studiostack-dev-db.cluster-example.us-east-2.rds.amazonaws.com',
  RDS_DATABASE: 'studiostackdev', RDS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-2:111122223333:secret:example',
  RDS_CA_BUNDLE_PATH: './test-ca.pem',
}
const config = databaseConfig(env)
const auth = { username: 'studiostack_app', password: 'TEST-ONLY' }
const ca = '-----BEGIN CERTIFICATE-----\nTEST-ONLY'
function fixture() {
  const client = { connect: vi.fn().mockResolvedValue(undefined), end: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) }
  const deps = { credentials: vi.fn().mockResolvedValue(auth), certificate: vi.fn().mockResolvedValue(ca),
    client: vi.fn(() => client as unknown as DatabaseClient) } satisfies DatabaseDependencies
  return { client, deps, database: createDatabase(config, deps) }
}

describe('environment separation', () => {
  it('requires an explicit environment and defaults to verified PostgreSQL settings', () => {
    expect(() => databaseConfig({ ...env, STUDIOSTACK_ENV: undefined })).toThrow('explicitly')
    expect(config).toMatchObject({ environment: 'dev', port: 5432, connectionTimeoutMillis: 45000 })
  })
  it('supports the separate production writer and database', () => {
    expect(databaseConfig({ ...env, STUDIOSTACK_ENV: 'prod', RDS_HOST: env.RDS_HOST.replace('-dev-', '-prod-'),
      RDS_DATABASE: 'studiostackprod' }).environment).toBe('prod')
  })
  it.each([
    { RDS_HOST: env.RDS_HOST.replace('-dev-', '-prod-') },
    { RDS_HOST: env.RDS_HOST.replace('cluster-', 'cluster-ro-') },
    { RDS_HOST: 'localhost' }, { RDS_DATABASE: 'studiostackprod' }, { AWS_REGION: 'us-east-1' },
    { RDS_AWS_ACCOUNT_ID: 'bad' }, { RDS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-2:999999999999:secret:wrong' },
    { RDS_SECRET_ARN: '' }, { RDS_CA_BUNDLE_PATH: '' }, { RDS_PORT: '0' },
    { RDS_PORT: '65536' }, { RDS_CONNECT_TIMEOUT_MS: 'Infinity' },
  ])('rejects invalid or cross-environment configuration %j', override => {
    expect(() => databaseConfig({ ...env, ...override })).toThrow()
  })
  it('prevents browser usage', () => {
    vi.stubGlobal('window', {})
    try {
      expect(() => databaseConfig(env)).toThrow('backend-only')
      expect(() => createDatabase(config)).toThrow('backend-only')
    } finally { vi.unstubAllGlobals() }
  })
})

describe('backend database connections', () => {
  it.each([null, {}, { username: 'app', password: '' }, { username: 'bad name', password: 'private' }])('rejects malformed credentials %j', value => {
    expect(() => parseCredentials(value)).toThrow('Invalid database secret')
  })
  it('uses verified TLS and parameterized queries, and closes the connection', async () => {
    const { deps, client, database } = fixture()
    await database.query('SELECT $1 AS value', ['safe value'])
    expect(deps.client).toHaveBeenCalledWith(expect.objectContaining({ ssl: { ca, rejectUnauthorized: true },
      database: 'studiostackdev', application_name: 'studiostack-dev-runtime', connectionTimeoutMillis: 45000 }))
    expect(client.query).toHaveBeenCalledWith('SELECT $1 AS value', ['safe value'])
    expect(client.end).toHaveBeenCalledTimes(1)
  })
  it.each(['postgres', 'rdsadmin'])('refuses master login %s for runtime', async username => {
    const { deps, database } = fixture()
    deps.credentials.mockResolvedValue({ ...auth, username })
    await expect(database.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(deps.client).not.toHaveBeenCalled()
  })
  it('allows an operator login only with explicit maintenance purpose', async () => {
    const { deps, database } = fixture()
    deps.credentials.mockResolvedValue({ ...auth, username: 'postgres' })
    await database.withClient(async client => { await client.query('SELECT 1') }, 'maintenance')
    expect(deps.client).toHaveBeenCalledWith(expect.objectContaining({ user: 'postgres' }))
  })
  it('requires a CA bundle', async () => {
    const { deps, database } = fixture()
    deps.certificate.mockResolvedValue('')
    await expect(database.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(deps.client).not.toHaveBeenCalled()
  })
  it('redacts driver errors and still closes the connection', async () => {
    const { client, database } = fixture()
    client.query.mockRejectedValue(new Error('password=PRIVATE; customer SQL'))
    await expect(database.query('SELECT 1')).rejects.toThrow('Database operation unavailable')
    expect(client.end).toHaveBeenCalledTimes(1)
  })
  it('does not replay SQL after an operation fails', async () => {
    const { client, database, deps } = fixture()
    client.query.mockRejectedValue({ code: '28P01' })
    await expect(database.query('INSERT ...')).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(client.query).toHaveBeenCalledTimes(1)
    expect(deps.credentials).toHaveBeenCalledTimes(1)
  })
  it('does not retry arbitrary connection errors', async () => {
    const { client, database, deps } = fixture()
    client.connect.mockRejectedValue(new Error('network'))
    await expect(database.query('SELECT 1')).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(client.end).toHaveBeenCalledTimes(1)
    expect(deps.credentials).toHaveBeenCalledTimes(1)
    expect(client.query).not.toHaveBeenCalled()
  })
  it('refreshes a rotated password once before executing any SQL', async () => {
    const { client, database, deps } = fixture()
    const fresh = { connect: vi.fn().mockResolvedValue(undefined), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) }
    client.connect.mockRejectedValue({ code: '28P01' })
    deps.client.mockReturnValueOnce(client as unknown as DatabaseClient).mockReturnValueOnce(fresh as unknown as DatabaseClient)
    await database.query('SELECT 1')
    expect(deps.credentials.mock.calls.map(call => call[1])).toEqual([false, true])
    expect(client.query).not.toHaveBeenCalled()
    expect(fresh.query).toHaveBeenCalledTimes(1)
    expect(client.end).toHaveBeenCalledTimes(1)
    expect(fresh.end).toHaveBeenCalledTimes(1)
  })
  it('commits a transaction on the same connection', async () => {
    const { database, client } = fixture()
    await database.transaction(async connection => { await connection.query('SELECT $1', [1]); return 7 })
    expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'SELECT $1', 'COMMIT'])
    expect(client.end).toHaveBeenCalledTimes(1)
  })
  it('rolls back a failed transaction', async () => {
    const { database, client } = fixture()
    await expect(database.transaction(async () => { throw new Error('private') })).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(client.query.mock.calls.map(call => call[0])).toEqual(['BEGIN', 'ROLLBACK'])
    expect(client.end).toHaveBeenCalledTimes(1)
  })
})

describe('guarded schema migrations', () => {
  it('defaults to a dry run in both environments', () => {
    expect(migrationOptions([], 'dev')).toEqual({ apply: false })
    expect(migrationOptions([], 'prod')).toEqual({ apply: false })
    expect(() => migrationOptions(['--unknown'], 'dev')).toThrow()
  })
  it('requires an extra production acknowledgement', () => {
    expect(() => migrationOptions(['--apply'], 'prod')).toThrow('Production')
    expect(migrationOptions(['--apply'], 'dev')).toEqual({ apply: true })
    expect(migrationOptions(['--apply', '--allow-production'], 'prod')).toEqual({ apply: true })
  })
  it('loads checksummed identity and organization-local group tables', async () => {
    const [migration] = await loadMigrations()
    expect(migration.name).toBe('001_identity_and_groups.sql')
    expect(migration.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(migration.sql).toContain('UNIQUE (cognito_issuer, cognito_subject)')
    expect(migration.sql).toContain('REFERENCES app.organization_memberships(organization_id, user_id)')
  })
  it('applies a migration transactionally and skips it on subsequent runs', async () => {
    const { database, client } = fixture()
    const migrations = await loadMigrations()
    expect(await applyMigrations(database)).toEqual(migrations.map(migration => migration.name))
    for (const migration of migrations) expect(client.query).toHaveBeenCalledWith('INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum])
    client.query.mockImplementation(async (sql: string, values: unknown[] = []) => ({ rows: sql.startsWith('SELECT checksum') ? [{ checksum: migrations.find(migration => migration.name === values[0])!.checksum }] : [] }))
    expect(await applyMigrations(database)).toEqual([])
  })
  it('rolls back if an already-applied migration was changed', async () => {
    const { database, client } = fixture()
    client.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT checksum') ? [{ checksum: 'different' }] : [] }))
    await expect(applyMigrations(database)).rejects.toBeInstanceOf(DatabaseUnavailableError)
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
  })
})

describe('private database Lambda connection check', () => {
  it('checks the selected database and TLS without returning credentials or records', async () => {
    const { database, client } = fixture()
    client.query.mockResolvedValue({ rows: [{ database: 'studiostackdev', tls: true }], rowCount: 1 })
    expect(await createDatabaseHandler(database, config)()).toEqual({ ok: true, environment: 'dev' })
    expect(client.query.mock.calls[0][0]).toContain('current_database()')
    expect(client.end).toHaveBeenCalledTimes(1)
  })
  it.each([
    { database: 'studiostackprod', tls: true },
    { database: 'studiostackdev', tls: false },
  ])('rejects the wrong database or unencrypted connection %j', row => {
    const { database, client } = fixture()
    client.query.mockResolvedValue({ rows: [row], rowCount: 1 })
    return expect(createDatabaseHandler(database, config)()).rejects.toBeInstanceOf(DatabaseUnavailableError)
  })
})
