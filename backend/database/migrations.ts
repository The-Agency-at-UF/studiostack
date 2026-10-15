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
      await client.query(migration.sql)
      await client.query('INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)', [migration.name, migration.checksum])
      applied.push(migration.name)
    }
    return applied
  }, 'maintenance')
}
