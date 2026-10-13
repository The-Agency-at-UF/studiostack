export type DatabaseEnvironment = 'dev' | 'prod'
export interface DatabaseConfig {
  environment: DatabaseEnvironment
  region: string
  clusterId: string
  host: string
  port: number
  database: string
  secretArn: string
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
  const clusterId = `studiostack-${environment}-db`
  const host = required('RDS_HOST')
  const suffix = host.slice(`${clusterId}.cluster-`.length)
  if (!host.startsWith(`${clusterId}.cluster-`) || !/^[a-z0-9]+\.us-east-2\.rds\.amazonaws\.com$/.test(suffix)) {
    throw new Error('RDS_HOST must be the selected environment\'s Aurora writer endpoint')
  }
  const database = required('RDS_DATABASE')
  if (database !== `studiostack${environment}`) {
    throw new Error('RDS_DATABASE does not match STUDIOSTACK_ENV')
  }
  const accountId = required('RDS_AWS_ACCOUNT_ID')
  if (!/^\d{12}$/.test(accountId)) throw new Error('RDS_AWS_ACCOUNT_ID must be a 12-digit account ID')
  const secretArn = required('RDS_SECRET_ARN')
  if (!secretArn.startsWith(`arn:aws:secretsmanager:${region}:${accountId}:secret:`) ||
      secretArn.endsWith(':secret:') || /\s/.test(secretArn)) {
    throw new Error('RDS_SECRET_ARN must belong to the configured region and account')
  }
  const caBundlePath = required('RDS_CA_BUNDLE_PATH')
  const port = Number(env.RDS_PORT ?? '5432')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RDS_PORT must be a valid TCP port')
  const connectionTimeoutMillis = Number(env.RDS_CONNECT_TIMEOUT_MS ?? '45000')
  if (!Number.isInteger(connectionTimeoutMillis) || connectionTimeoutMillis < 1000 || connectionTimeoutMillis > 60000) {
    throw new Error('RDS_CONNECT_TIMEOUT_MS must be between 1000 and 60000')
  }
  return { environment, region, clusterId, host, port, database, secretArn, caBundlePath, connectionTimeoutMillis }
}
