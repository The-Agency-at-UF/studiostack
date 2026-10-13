import { createDatabase } from './client'
import { databaseConfig } from './config'
import { applyMigrations } from './migrations'
import { databaseApiGrants } from './api-grants'

/** Package only. Deploy/invoke temporarily with reviewed maintenance access.
 * Never attach this entry point to HTTP API Gateway or leave it deployed.
 */
export async function handler() {
  let stage = 'configuration'
  try {
    const config = databaseConfig()
    if (process.env.APPLY_DATABASE_API_SCHEMA !== 'yes' ||
        (config.environment === 'prod' && process.env.ALLOW_PRODUCTION_SCHEMA !== 'yes')) throw new Error('Maintenance approval required')
    const database = createDatabase(config)
    stage = 'migrations'
    const applied = await applyMigrations(database, new URL('file:///var/task/migrations/'))
    stage = 'grants'
    await database.transaction(async client => {
      const role = await client.query<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolbypassrls: boolean }>(
        'SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = $1', [`studiostack_${config.environment}_app`])
      if (role.rows.length !== 1 || Object.values(role.rows[0]).some(Boolean)) throw new Error('Restricted application role required')
      await client.query(databaseApiGrants(config.environment))
    }, 'maintenance')
    return { ok: true, environment: config.environment, applied }
  } catch (error) {
    const code = (error as { diagnosticCode?: string }).diagnosticCode
    const detail = (error as { diagnosticStage?: string }).diagnosticStage
    // Named stage and SQLSTATE only; never SQL text, secret or driver message.
    throw new Error(`Database API schema setup unavailable (${stage}${detail ? `/${detail}` : ''}${code ? `/${code}` : ''})`)
  }
}
