import type { Handler } from 'aws-lambda'
import { createDatabase, DatabaseUnavailableError } from './client'
import { databaseConfig } from './config'
import type { DatabaseConfig } from './config'

// IAM-invoked connection check, not a public API or arbitrary SQL executor.
// Uses the runtime application login, never the cluster's master secret.
export function createDatabaseHandler(database: ReturnType<typeof createDatabase>, config: DatabaseConfig) {
  return async () => {
    const result = await database.query<{ database: string; tls: boolean }>(`
      SELECT current_database() AS database,
        (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS tls
    `)
    if (result.rows[0]?.database !== config.database || result.rows[0]?.tls !== true) {
      throw new DatabaseUnavailableError()
    }
    return { ok: true, environment: config.environment }
  }
}

export const handler: Handler = async () => {
  const config = databaseConfig()
  return createDatabaseHandler(createDatabase(config), config)()
}
