export type DatabaseEnvironment = 'dev' | 'prod'
/** `secret` reads the login from Secrets Manager; `iam` signs a short-lived RDS auth token locally. */
export type DatabaseAuthMode = 'secret' | 'iam'
/** Aurora cluster writer endpoint, or a single RDS for PostgreSQL instance endpoint. */
export type DatabaseEndpoint = 'aurora' | 'instance'
export interface DatabaseConfig {
  environment: DatabaseEnvironment
  region: string
  /** Aurora cluster ID (`studiostack-{env}-db`) or RDS instance ID (`studiostack-{env}-pg`). */
  databaseId: string
  endpoint: DatabaseEndpoint
  host: string
  port: number
  database: string
  authMode: DatabaseAuthMode
  /** Secrets Manager login; empty when authMode is `iam`. */
  secretArn: string
  /** Database user the IAM token is signed for; empty when authMode is `secret`. */
  iamUser: string
  caBundlePath: string
  connectionTimeoutMillis: number
}

export function databaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConfig {
  if (typeof window !== 'undefined') throw new Error('Database configuration is backend-only')
  const environment = env.STUDIOSTACK_ENV
  if (environment !== 'dev' && environment !== 'prod') {
    throw new Error('STUDIOSTACK_ENV must explicitly be dev or prod')
  }
  const required = (key: string) => {
    const value = env[key]?.trim()
    if (!value) throw new Error(`${key} is required`)
    return value
  }
  const region = required('AWS_REGION')
  if (region !== 'us-east-2') throw new Error('These databases are configured for us-east-2')
  const host = required('RDS_HOST')
  const clusterId = `studiostack-${environment}-db`, instanceId = `studiostack-${environment}-pg`
  const regional = /^[a-z0-9]+\.us-east-2\.rds\.amazonaws\.com$/
  let endpoint: DatabaseEndpoint, databaseId: string
  if (host.startsWith(`${clusterId}.cluster-`) && regional.test(host.slice(`${clusterId}.cluster-`.length))) {
    endpoint = 'aurora'; databaseId = clusterId
  } else if (host.startsWith(`${instanceId}.`) && regional.test(host.slice(`${instanceId}.`.length))) {
    endpoint = 'instance'; databaseId = instanceId
  } else {
    throw new Error('RDS_HOST must be the selected environment\'s Aurora writer or RDS instance endpoint')
  }
  const database = required('RDS_DATABASE')
  if (database !== `studiostack${environment}`) {
    throw new Error('RDS_DATABASE does not match STUDIOSTACK_ENV')
  }
  const accountId = required('RDS_AWS_ACCOUNT_ID')
  if (!/^\d{12}$/.test(accountId)) throw new Error('RDS_AWS_ACCOUNT_ID must be a 12-digit account ID')
  const authMode = (env.RDS_AUTH?.trim() || 'secret') as DatabaseAuthMode
  if (authMode !== 'secret' && authMode !== 'iam') throw new Error('RDS_AUTH must be secret or iam')
  let secretArn = '', iamUser = ''
  if (authMode === 'secret') {
    secretArn = required('RDS_SECRET_ARN')
    if (!secretArn.startsWith(`arn:aws:secretsmanager:${region}:${accountId}:secret:`) ||
        secretArn.endsWith(':secret:') || /\s/.test(secretArn)) {
      throw new Error('RDS_SECRET_ARN must belong to the configured region and account')
    }
  } else {
    iamUser = required('RDS_IAM_USER')
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(iamUser)) throw new Error('RDS_IAM_USER must be a PostgreSQL user name')
  }
  const caBundlePath = required('RDS_CA_BUNDLE_PATH')
  const port = Number(env.RDS_PORT ?? '5432')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RDS_PORT must be a valid TCP port')
  const connectionTimeoutMillis = Number(env.RDS_CONNECT_TIMEOUT_MS ?? '45000')
  if (!Number.isInteger(connectionTimeoutMillis) || connectionTimeoutMillis < 1000 || connectionTimeoutMillis > 60000) {
    throw new Error('RDS_CONNECT_TIMEOUT_MS must be between 1000 and 60000')
  }
  return { environment, region, databaseId, endpoint, host, port, database, authMode, secretArn, iamUser, caBundlePath, connectionTimeoutMillis }
}
