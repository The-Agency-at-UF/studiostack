import type { createDatabase, DatabaseClient } from './client'
import type { DatabaseEnvironment } from './config'

type Database = ReturnType<typeof createDatabase>
export interface TableDigest { rows: number; md5: string }
export type SchemaDigest = Record<string, TableDigest>

const batchSize = 500
const quoted = (name: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error('Unexpected table or column name')
  return `"${name}"`
}

/**
 * Creates the IAM-only application login on the new RDS instance. It has no
 * password, so it can only sign in with a token for the runtime role.
 * Runs before migrations so any grant in a migration finds the role.
 */
export async function prepareRdsLogin(target: Database, environment: DatabaseEnvironment) {
  const role = `studiostack_${environment}_app`
  return target.transaction(async client => {
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])
    if (!existing.rows.length) await client.query(`CREATE ROLE ${quoted(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 5`)
    await client.query(`GRANT rds_iam TO ${quoted(role)}`)
    return { ok: true, role, created: !existing.rows.length }
  }, 'maintenance')
}

/** Application tables, parents before children, so foreign keys resolve while rows are inserted. */
export async function appTables(client: DatabaseClient) {
  const { rows: tables } = await client.query<{ name: string }>(
    "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relkind IN ('r','p') AND c.relname <> 'schema_migrations' ORDER BY c.relname")
  const { rows: edges } = await client.query<{ child: string; parent: string }>(
    "SELECT ch.relname AS child, pa.relname AS parent FROM pg_constraint k JOIN pg_class ch ON ch.oid = k.conrelid JOIN pg_class pa ON pa.oid = k.confrelid JOIN pg_namespace n ON n.oid = ch.relnamespace WHERE k.contype = 'f' AND n.nspname = 'app' AND ch.oid <> pa.oid" +
    // Only required (NOT NULL) references order the copy; optional ones such as a
    // logo photo pointing back at its organization would otherwise form cycles.
    " AND NOT EXISTS (SELECT 1 FROM unnest(k.conkey) AS col(num) JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = col.num WHERE NOT a.attnotnull)")
  const names = tables.map(t => t.name), ordered: string[] = [], done = new Set<string>()
  while (ordered.length < names.length) {
    const ready = names.filter(n => !done.has(n) && edges.every(e => e.child !== n || done.has(e.parent) || !names.includes(e.parent)))
    // A foreign-key cycle still copies correctly: inserts run with FK triggers disabled.
    for (const name of ready.length ? ready : names.filter(n => !done.has(n)).slice(0, 1)) { ordered.push(name); done.add(name) }
  }
  return ordered
}

async function insertableColumns(client: DatabaseClient, table: string) {
  const { rows } = await client.query<{ name: string }>(
    "SELECT a.attname AS name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' ORDER BY a.attnum", [table])
  return rows.map(r => quoted(r.name))
}

/**
 * Copies every application row from Aurora into the empty RDS database in one
 * target transaction: all of it lands or none of it does. Refuses a target
 * that already has rows, so it can never merge into or overwrite live data.
 */
export async function copyAppData(source: Database, target: Database) {
  return source.transaction(async from => {
    await from.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    return target.transaction(async to => {
      const tables = await appTables(from), counts: Record<string, number> = {}
      for (const table of tables) {
        const { rows: [{ present }] } = await to.query<{ present: boolean }>(`SELECT EXISTS (SELECT 1 FROM app.${quoted(table)}) AS present`)
        if (present) throw new Error('Target database already has application data')
      }
      // Row data is copied exactly as stored; triggers and FK checks would only re-validate it.
      await to.query("SET LOCAL session_replication_role = 'replica'")
      for (const table of tables) {
        const columns = (await insertableColumns(to, table)).join(', ')
        await from.query(`DECLARE copy_rows NO SCROLL CURSOR FOR SELECT to_jsonb(t) AS row FROM app.${quoted(table)} t`)
        counts[table] = 0
        for (;;) {
          const { rows } = await from.query<{ row: unknown }>(`FETCH ${batchSize} FROM copy_rows`)
          if (!rows.length) break
          await to.query(`INSERT INTO app.${quoted(table)} (${columns}) OVERRIDING SYSTEM VALUE SELECT ${columns} FROM jsonb_populate_recordset(NULL::app.${quoted(table)}, $1::jsonb)`, [JSON.stringify(rows.map(r => r.row))])
          counts[table] += rows.length
        }
        await from.query('CLOSE copy_rows')
      }
      const { rows: sequences } = await from.query<{ name: string; value: string | null }>(
        "SELECT sequencename AS name, last_value::text AS value FROM pg_sequences WHERE schemaname = 'app'")
      for (const sequence of sequences) if (sequence.value !== null) await to.query('SELECT setval($1::regclass, $2::bigint, true)', [`app.${quoted(sequence.name)}`, sequence.value])
      return { ok: true, tables: tables.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), counts }
    }, 'maintenance')
  }, 'maintenance')
}

/** Row count and a content hash per table, plus the applied migrations; never row data. */
export async function digestAppData(database: Database): Promise<{ migrations: string; tables: SchemaDigest }> {
  return database.transaction(async client => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    await client.query("SET LOCAL TIME ZONE 'UTC'")
    const tables: SchemaDigest = {}
    for (const table of await appTables(client)) {
      const { rows: [row] } = await client.query<{ rows: string; md5: string }>(
        `SELECT count(*)::text AS rows, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS md5 FROM app.${quoted(table)} t`)
      tables[table] = { rows: Number(row.rows), md5: row.md5 }
    }
    const { rows: [m] } = await client.query<{ md5: string }>("SELECT md5(coalesce(string_agg(name || ':' || checksum, ',' ORDER BY name), '')) AS md5 FROM app.schema_migrations")
    return { migrations: m.md5, tables }
  }, 'maintenance')
}

/** Names only: which tables differ between the two digests. */
export function digestDifferences(source: Awaited<ReturnType<typeof digestAppData>>, target: Awaited<ReturnType<typeof digestAppData>>) {
  const names = [...new Set([...Object.keys(source.tables), ...Object.keys(target.tables)])].sort()
  const tables = names.filter(n => source.tables[n]?.rows !== target.tables[n]?.rows || source.tables[n]?.md5 !== target.tables[n]?.md5)
  return { migrations: source.migrations !== target.migrations, tables }
}
