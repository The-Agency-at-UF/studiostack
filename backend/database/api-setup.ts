import { bootstrapProductionAdmin } from '../production/bootstrap'
import { handOverAgencyOwnership } from '../production/owner-handover'
import { createDatabase } from './client'
import { databaseConfig } from './config'
import { applyMigrations } from './migrations'
import { databaseApiGrants } from './api-grants'
import { fixtures } from './dev-fixtures'

/** Package only. Deploy/invoke temporarily with reviewed maintenance access.
 * Never attach this entry point to HTTP API Gateway or leave it deployed.
 */
export async function handler(event: Parameters<typeof fixtures>[0] | {action:'bootstrap-production-admin';subject:string;email:string} | {action:'hand-over-agency-ownership';owner:unknown;formerOwner?:unknown} | Record<string, never> = {}) {
  let stage = 'configuration'
  try {
    const config = databaseConfig()
    if (process.env.APPLY_DATABASE_API_SCHEMA !== 'yes' ||
        (config.environment === 'prod' && process.env.ALLOW_PRODUCTION_SCHEMA !== 'yes')) throw new Error('Maintenance approval required')
    const database = createDatabase(config)
    if ('action' in event && event.action === 'bootstrap-production-admin') {
      stage = 'bootstrap'
      return await bootstrapProductionAdmin(database,config,event)
    }
    if ('action' in event && event.action === 'hand-over-agency-ownership') {
      stage = 'ownership'
      return await handOverAgencyOwnership(database,config,event)
    }
    stage = 'fixtures'
    if ('action' in event) return await fixtures(event as Parameters<typeof fixtures>[0])
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
