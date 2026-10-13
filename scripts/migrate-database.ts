import { databaseConfig } from '../backend/database/config'
import { createDatabase } from '../backend/database/client'
import { applyMigrations, loadMigrations, migrationOptions } from '../backend/database/migrations'

async function main() {
  const config = databaseConfig()
  const { apply } = migrationOptions(process.argv.slice(2), config.environment)
  if (!apply) {
    const migrations = await loadMigrations()
    console.log(`Dry run for ${config.environment}: ${migrations.map(item => item.name).join(', ')}. No AWS/database connection was opened.`)
    return
  }
  const applied = await applyMigrations(createDatabase(config))
  console.log(`Applied ${applied.length} migration(s) to ${config.environment}: ${applied.join(', ') || 'already current'}`)
}

main().catch(() => {
  console.error('Migration failed. Confirm config/flags, private connectivity, migration history and operator permissions. No credentials or raw errors are logged.')
  process.exitCode = 1
})
