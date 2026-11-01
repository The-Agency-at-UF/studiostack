import { readFile } from 'node:fs/promises'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import pg from 'pg'
import type { ClientConfig, QueryResult, QueryResultRow } from 'pg'
import type { DatabaseConfig } from './config'

export type CredentialPurpose = 'runtime' | 'maintenance'
export interface DatabaseCredentials { username: string; password: string }
export type DatabaseClient = Pick<pg.Client, 'connect' | 'query' | 'end'>
export interface DatabaseDependencies {
  credentials(config: DatabaseConfig, refresh: boolean): Promise<DatabaseCredentials>
  certificate(path: string): Promise<string>
  client(config: ClientConfig): DatabaseClient
}

export class DatabaseUnavailableError extends Error {
  constructor(public readonly diagnosticCode?: string, public readonly diagnosticStage?: string) { super('Database operation unavailable; check backend connectivity/configuration'); this.name = 'DatabaseUnavailableError' }
}

export function parseCredentials(value: unknown): DatabaseCredentials {
  if (!value || typeof value !== 'object') throw new Error('Invalid database secret')
  const { username, password } = value as Record<string, unknown>
  if (typeof username !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username) ||
      typeof password !== 'string' || !password) throw new Error('Invalid database secret')
  return { username, password }
}

// Cache only in backend memory, never on disk or in the browser. Rotation is
// refreshed every minute, and immediately if connecting returns invalid_password.
const secrets = new Map<string, { credentials: DatabaseCredentials; expiresAt: number }>()
async function credentials(config: DatabaseConfig, refresh: boolean): Promise<DatabaseCredentials> {
  const cached = secrets.get(config.secretArn)
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.credentials
  const service = new SecretsManagerClient({ region: config.region })
  try {
    const result = await service.send(new GetSecretValueCommand({ SecretId: config.secretArn, VersionStage: 'AWSCURRENT' }))
    const serialized = result.SecretString ?? (result.SecretBinary ? Buffer.from(result.SecretBinary).toString('utf8') : '')
    const parsed = parseCredentials(JSON.parse(serialized))
    secrets.set(config.secretArn, { credentials: parsed, expiresAt: Date.now() + 60_000 })
    return parsed
  } finally { service.destroy() }
}

const certificates = new Map<string, string>()
async function cachedCertificate(path: string): Promise<string> {
  const cached = certificates.get(path)
  if (cached) return cached
  const cert = await readFile(path, 'utf8')
  certificates.set(path, cert)
  return cert
}

const defaultDependencies: DatabaseDependencies = {
  credentials,
  certificate: cachedCertificate,
  client: config => new pg.Client(config),
}

function connectionOptions(config: DatabaseConfig, auth: DatabaseCredentials, ca: string, purpose: CredentialPurpose): ClientConfig {
  if (purpose === 'runtime' && ['postgres', 'rdsadmin'].includes(auth.username.toLowerCase())) {
    throw new Error('Runtime database access requires a restricted application login, not the master user')
  }
  if (!ca.includes('-----BEGIN CERTIFICATE-----')) throw new Error('An RDS CA certificate bundle is required')
  return {
    host: config.host, port: config.port, database: config.database,
    user: auth.username, password: auth.password,
    ssl: { ca, rejectUnauthorized: true },
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    statement_timeout: 5000,
    query_timeout: 10_000,
    options: '-c idle_in_transaction_session_timeout=20000',
    application_name: `studiostack-${config.environment}-${purpose}`,
    keepAlive: true,
    keepAliveInitialDelayMillis: 1000,
  }
}

/** Runs operation in one transaction on an existing connection, rolling back on any error. */
export async function inTransaction<T>(client: DatabaseClient, operation: (client: DatabaseClient) => Promise<T>): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}
export function createDatabase(config: DatabaseConfig, deps: DatabaseDependencies = defaultDependencies) {
  if (typeof window !== 'undefined') throw new Error('Database access is backend-only')
  async function withClient<T>(operation: (client: DatabaseClient) => Promise<T>, purpose: CredentialPurpose = 'runtime'): Promise<T> {
    let client: DatabaseClient | undefined
    let stage = 'certificate'
    try {
      const ca = await deps.certificate(config.caBundlePath)
      stage = 'secret'
      let auth = parseCredentials(await deps.credentials(config, false))
      stage = 'connection'
      client = deps.client(connectionOptions(config, auth, ca, purpose))
      try { await client.connect() } catch (error) {
        const code = (error as { code?: string })?.code
        if (code === '28P01') {
          // Retry ONLY establishment after password rotation. Never replay SQL or
          // callbacks: retrying a write could duplicate a reservation or checkout.
          await client.end().catch(() => undefined)
          client = undefined
          auth = parseCredentials(await deps.credentials(config, true))
          client = deps.client(connectionOptions(config, auth, ca, purpose))
          await client.connect()
        } else if (code && ['57P03', 'ECONNRESET', 'ECONNREFUSED'].includes(code)) {
          // Aurora Serverless resume or transient database startup connection failure.
          // Retry establishment once before executing any SQL or callbacks.
          await client.end().catch(() => undefined)
          client = undefined
          await new Promise(r => setTimeout(r, 1000))
          client = deps.client(connectionOptions(config, auth, ca, purpose))
          await client.connect()
        } else {
          throw error
        }
      }
      stage = 'operation'
      return await operation(client)
    } catch (error) {
      // Driver/AWS errors can contain SQL, credentials or private customer data.
      let code = (error as { code?: unknown })?.code ?? (error as { name?: string })?.name
      if (stage === 'secret' && (error as { name?: string })?.name === 'AccessDeniedException') {
        const message = (error as { message?: string }).message ?? ''
        if (/VPC endpoint policy/i.test(message)) code = 'AccessDeniedEndpoint'
        else if (/identity.based policy/i.test(message)) code = 'AccessDeniedIdentity'
        else if (/kms:Decrypt/i.test(message)) code = 'AccessDeniedKms'
      }
      throw new DatabaseUnavailableError(typeof code === 'string' && /^[A-Za-z0-9_]{2,40}$/.test(code) ? code : undefined, stage)
    } finally {
      // Close before returning from Lambda; idle pool timers can freeze there,
      // keeping dev connections open and defeating Aurora auto-pause.
      await client?.end().catch(() => undefined)
    }
  }
  async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return withClient(client => client.query<T>(text, values))
  }
  async function transaction<T>(operation: (client: DatabaseClient) => Promise<T>, purpose: CredentialPurpose = 'runtime'): Promise<T> {
    return withClient(client => inTransaction(client, operation), purpose)
  }
  return { withClient, query, transaction }
}
