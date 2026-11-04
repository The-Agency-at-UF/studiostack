import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import type { DatabaseEnvironment } from './config'
import type { createDatabase } from './client'

export function migrationOptions(args: string[], environment: DatabaseEnvironment) {
  if (args.some(arg => !['--apply', '--allow-production'].includes(arg))) throw new Error('Unknown migration flag')
  const apply = args.includes('--apply')
  if (apply && environment === 'prod' && !args.includes('--allow-production')) {
    throw new Error('Production migrations require --apply --allow-production')
  }
  return { apply }
}

export async function loadMigrations(directory = new URL('./migrations/', import.meta.url)) {
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort()
  return Promise.all(names.map(async name => {
    const sql = await readFile(new URL(name, directory), 'utf8')
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
  }))
}

/**
 * Production applied these two migrations from a branch under earlier names before they were renumbered on main.
 * The earlier SQL is the same apart from a comment, so the current name is recorded instead of running it again.
 * Only the exact earlier file, identified by its checksum, counts.
 */
export const renamedMigrations: Record<string, { name: string; checksum: string }> = {
  '018_bug_report_email.sql': { name: '013_bug_report_email.sql', checksum: '8a8fe93f15b0f763cb63e84ce1e3cc695263db64694b57dc0741db3d101247f4' },
  '019_feature_requests.sql': { name: '012_feature_requests.sql', checksum: '9b9ae42f01dfc8739bd61081c83094a87ac8899ed01b3fbabb69afc981317fc3' },
}

export async function applyMigrations(database: ReturnType<typeof createDatabase>, directory?: URL) {
  const migrations = await loadMigrations(directory)
  return database.transaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(7423119)")
    await client.query('CREATE SCHEMA IF NOT EXISTS app')
    await client.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const applied: string[] = []
    for (const migration of migrations) {
      const existing = await client.query<{ checksum: string }>('SELECT checksum FROM app.schema_migrations WHERE name = $1', [migration.name])
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== migration.checksum) throw new Error('Applied migration checksum differs; create a new migration instead')
        continue
      }
      const earlier = renamedMigrations[migration.name]
      const recorded = earlier && (await client.query<{ checksum: string }>('SELECT checksum FROM app.schema_migrations WHERE name = $1', [earlier.name])).rows[0]
      if (recorded && recorded.checksum !== earlier.checksum) throw new Error('Applied migration checksum differs; create a new migration instead')
      if (!recorded) await client.query(migration.sql)
      await client.query('INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum])
      applied.push(migration.name)
    }
    return applied
  }, 'maintenance')
}
