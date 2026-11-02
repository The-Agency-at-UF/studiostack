import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { createDatabase, parseCredentials } from './client'
import { databaseConfig } from './config'

// Temporary, IAM-invoked fixed-purpose setup. Never accepts SQL/usernames in events.
// Neither changes existing passwords nor runs schema migrations. Remove after use.
export async function handler() {
  let stage = 'configuration'
  try {
    const config = databaseConfig()
    const appSecret = process.env.RDS_APP_SECRET_ARN
    if (!appSecret?.startsWith(`arn:aws:secretsmanager:${config.region}:${process.env.RDS_AWS_ACCOUNT_ID}:secret:studiostack/${config.environment}/database-app-`)) throw new Error('Invalid application secret reference')
    stage = 'application secret'
    const service = new SecretsManagerClient({ region: config.region, maxAttempts: 2 })
    let auth
    try {
      const result = await service.send(new GetSecretValueCommand({ SecretId: appSecret, VersionStage: 'AWSCURRENT' }))
      auth = parseCredentials(JSON.parse(result.SecretString ?? ''))
    } finally { service.destroy() }
    if (auth.username !== `studiostack_${config.environment}_app`) throw new Error('Unexpected application username')
    if (!/^[A-Za-z0-9]{48}$/.test(auth.password)) throw new Error('Unexpected generated credential format')
    const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
    const quoteLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`
    stage = 'database login setup'
    await createDatabase(config).transaction(async client => {
      const existing = await client.query<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
        'SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1', [auth.username])
      if (!existing.rows.length) {
        await client.query(`CREATE ROLE ${quoteIdentifier(auth.username)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 5 PASSWORD ${quoteLiteral(auth.password)}`)
        await client.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(config.database)} TO ${quoteIdentifier(auth.username)}`)
      } else {
        const role = existing.rows[0]
        const memberships = await client.query<{ count: string }>('SELECT count(*) FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = $1)', [auth.username])
        if (role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolreplication || role.rolbypassrls || !role.rolcanlogin || memberships.rows[0]?.count !== '0') {
          throw new Error('Existing login is not restricted; refusing changes')
        }
      }
    }, 'maintenance')
    stage = 'application login verification'
    const result = await createDatabase({ ...config, secretArn: appSecret }).query<{ database: string; tls: boolean }>(
      'SELECT current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls')
    if (result.rows[0]?.database !== config.database || result.rows[0]?.tls !== true) throw new Error('Unexpected connection')
    return { ok: true, environment: config.environment, applicationLogin: 'verified' }
  } catch {
    // Never expose AWS/driver errors, SQL, credential strings, or customer data.
    throw new Error(`Database setup unavailable (${stage})`)
  }
}
