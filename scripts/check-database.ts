import { databaseConfig } from '../backend/database/config'
import { createDatabase } from '../backend/database/client'

async function main() {
  const config = databaseConfig()
  const database = createDatabase(config)
  await database.withClient(async client => {
    const result = await client.query<{ database: string; tls: boolean }>(`
      SELECT current_database() AS database,
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls
    `)
    if (result.rows[0]?.database !== config.database || result.rows[0]?.tls !== true) {
      throw new Error('Unexpected database or TLS state')
    }
  }, 'maintenance')
  console.log(`Connected to StudioStack ${config.environment} database with verified TLS. No data was changed.`)
}

main().catch(() => {
  console.error('Database check failed. Check SSO/IAM, local env, CA bundle and private VPC connectivity; no credentials or raw errors are logged.')
  process.exitCode = 1
})
