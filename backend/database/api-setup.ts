import { bootstrapProductionAdmin } from '../production/bootstrap'
import { handOverAgencyOwnership } from '../production/owner-handover'
import { retireStaleAccount } from '../production/stale-account'
import { createDatabase } from './client'
import { databaseConfig } from './config'
import { applyMigrations } from './migrations'
import { databaseApiGrants } from './api-grants'
import { fixtures } from './dev-fixtures'
import { copyAppData, digestAppData, digestDifferences, prepareRdsLogin } from './rds-copy'

type RdsCutoverAction = { action: 'rds-prepare' | 'rds-copy' | 'rds-verify' }

/** The new RDS instance, reached with its own RDS-managed master secret; only set for the cutover. */
function rdsTarget(environment: string) {
  const host = process.env.TARGET_RDS_HOST, secret = process.env.TARGET_RDS_SECRET_ARN
  if (!host || !secret || process.env.ALLOW_RDS_CUTOVER !== 'yes') throw new Error('RDS cutover approval required')
  const target = databaseConfig({ ...process.env, RDS_HOST: host, RDS_SECRET_ARN: secret, RDS_AUTH: 'secret' })
  if (target.endpoint !== 'instance' || target.environment !== environment) throw new Error('RDS cutover target must be this environment\'s RDS instance')
  return target
}

/** Package only. Deploy/invoke temporarily with reviewed maintenance access.
 * Never attach this entry point to HTTP API Gateway or leave it deployed.
 */
export async function handler(event: Parameters<typeof fixtures>[0] | {action:'bootstrap-production-admin';subject:string;email:string} | {action:'hand-over-agency-ownership';owner:unknown;formerOwner?:unknown} | {action:'retire-stale-account';current:unknown;staleSubject?:string;apply?:boolean} | RdsCutoverAction | Record<string, never> = {}) {
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
    if ('action' in event && event.action === 'retire-stale-account') {
      stage = 'account-repair'
      return await retireStaleAccount(database,config,event)
    }
    if ('action' in event && (event.action === 'rds-prepare' || event.action === 'rds-copy' || event.action === 'rds-verify')) {
      stage = event.action.replace('-', '')
      // Source is the Aurora cluster this function is configured for; it is only read.
      if (config.endpoint !== 'aurora') throw new Error('RDS cutover source must be the Aurora cluster')
      const targetConfig = rdsTarget(config.environment), target = createDatabase(targetConfig)
      if (event.action === 'rds-prepare') {
        const login = await prepareRdsLogin(target, config.environment)
        const applied = await applyMigrations(target, new URL('file:///var/task/migrations/'))
        await target.transaction(client => client.query(databaseApiGrants(config.environment)), 'maintenance')
        return { ...login, applied: applied.length }
      }
      if (event.action === 'rds-copy') return await copyAppData(database, target)
      const [from, to] = await Promise.all([digestAppData(database), digestAppData(target)])
      const differences = digestDifferences(from, to)
      return { ok: !differences.migrations && !differences.tables.length, differences,
        rows: Object.fromEntries(Object.entries(from.tables).map(([name, t]) => [name, t.rows])) }
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
