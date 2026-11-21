import type { createDatabase, DatabaseClient } from './client'
import type { DatabaseConfig } from './config'
import { databaseApiGrants } from './api-grants'
import { loadMigrations, renamedMigrations } from './migrations'
import { appTables, copyRows, quoted } from './rds-copy'

type Database = ReturnType<typeof createDatabase>
type Migration = Awaited<ReturnType<typeof loadMigrations>>[number]
export interface AppliedMigration { name: string; checksum: string }
/** A dev Cognito login that should keep its real email and own the copied account with that email. */
export interface KeptAccount { email: string; subject?: string }

/** Point-in-time restores of production made by copy-prod-to-dev.ts, e.g. studiostack-prod-pg-devcopy-20261121093000. */
export const devCopyInstancePattern = /^studiostack-prod-pg-devcopy-\d{14}$/
export const maskedDomain = 'example.invalid'
const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

/**
 * Connection settings for the temporary restore of production. Only accepted
 * by dev maintenance; the restore sits in dev's database network, so this
 * never reaches the live production instance.
 */
export function devCopySourceConfig(target: DatabaseConfig, host: string, secretArn: string): DatabaseConfig {
  const id = host.split('.')[0]
  if (target.environment !== 'dev' || !devCopyInstancePattern.test(id) || !/^[a-z0-9-]+\.[a-z0-9]+\.us-east-2\.rds\.amazonaws\.com$/.test(host)) throw new Error('Copy source must be a temporary restore of production')
  if (!/^arn:aws:secretsmanager:us-east-2:\d{12}:secret:rds!db-[a-f0-9-]+-[A-Za-z0-9]{6}$/.test(secretArn)) throw new Error('Copy source needs its RDS-managed master secret')
  return { ...target, environment: 'prod', databaseId: id, endpoint: 'instance', host, database: 'studiostackprod', authMode: 'secret', secretArn, iamUser: '' }
}

/**
 * This build's migrations that reproduce the source's applied list exactly.
 * Fails if production applied a migration this build lacks or has a different
 * version of; rebuild from production's commit in that case.
 */
export function migrationsMatching(applied: AppliedMigration[], available: Migration[]) {
  const recorded = new Map(applied.map(m => [m.name, m.checksum])), plan: Migration[] = [], covered = new Set<string>()
  let ended = false
  for (const migration of available) {
    if (recorded.has(migration.name) && recorded.get(migration.name) !== migration.checksum) throw new Error(`Production applied a different ${migration.name}; build from production's commit`)
    const earlier = renamedMigrations[migration.name]
    const present = recorded.get(migration.name) === migration.checksum || (!!earlier && recorded.get(earlier.name) === earlier.checksum)
    if (!present) { ended = true; continue }
    if (ended) throw new Error(`Production applied ${migration.name} without an earlier migration in this build; build from production's commit`)
    plan.push(migration); covered.add(migration.name); if (earlier) covered.add(earlier.name)
  }
  const missing = applied.filter(m => !covered.has(m.name)).map(m => m.name)
  if (missing.length) throw new Error(`This build lacks production migrations ${missing.join(', ')}; build from production's commit`)
  return plan
}

/** Every leased email queue and the status that stops it; a new queue must be added here before copying. */
const deliveryQueues = [
  { table: 'production_outbox', column: 'status', active: ['pending', 'sending', 'uncertain'], stopped: 'failed' },
  { table: 'organization_invitations', column: 'delivery_status', active: ['queued', 'sending', 'uncertain'], stopped: 'failed' },
  { table: 'user_alerts', column: 'email_status', active: ['pending', 'sending', 'uncertain'], stopped: 'suppressed' },
  { table: 'bug_reports', column: 'email_status', active: ['pending', 'sending', 'uncertain'], stopped: 'suppressed' },
]

/**
 * Replaces dev's whole `app` schema with production's: the same migrations,
 * every row, then emails masked, logins pointed at dev Cognito and unsent
 * email stopped. One dev transaction, so dev is either a full masked copy or
 * exactly as it was. Production is only read, in one consistent snapshot.
 */
export async function replaceWithProductionCopy(source: Database, target: Database, options: { issuer: string; keep: KeptAccount[]; migrations?: URL }) {
  const keep = options.keep.map(k => ({ email: k.email.toLowerCase(), subject: k.subject }))
  if (keep.length > 10 || keep.some(k => !emailPattern.test(k.email) || (k.subject !== undefined && !/^[a-f0-9-]{36}$/.test(k.subject)))) throw new Error('Kept accounts must be verified emails with dev Cognito subjects')
  if (!/^https:\/\/cognito-idp\.us-east-2\.amazonaws\.com\/us-east-2_[a-zA-Z0-9]+$/.test(options.issuer)) throw new Error('Dev Cognito issuer required')
  const available = await loadMigrations(options.migrations)
  return source.transaction(async from => {
    await from.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
    const { rows: applied } = await from.query<AppliedMigration & { applied_at: string }>('SELECT name, checksum, applied_at::text FROM app.schema_migrations ORDER BY name')
    const plan = migrationsMatching(applied, available)
    return target.transaction(async to => {
      await to.query("SET LOCAL lock_timeout = '30s'")
      await to.query('SELECT pg_advisory_xact_lock(7423119)')
      await to.query('DROP SCHEMA IF EXISTS app CASCADE')
      await to.query('CREATE SCHEMA app')
      await to.query('CREATE TABLE app.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
      for (const migration of plan) await to.query(migration.sql)
      for (const m of applied) await to.query('INSERT INTO app.schema_migrations (name, checksum, applied_at) VALUES ($1, $2, $3)', [m.name, m.checksum, m.applied_at])
      await to.query(databaseApiGrants('dev'))
      const tables = await appTables(from), counts = await copyRows(from, to, tables)
      for (const table of tables) {
        const { rows: [{ rows }] } = await to.query<{ rows: string }>(`SELECT count(*)::text AS rows FROM app.${quoted(table)}`)
        if (Number(rows) !== counts[table]) throw new Error(`Copied row count differs for ${table}`)
      }
      const maskedRows = await maskEmails(to, keep.map(k => k.email))
      const linked = await relinkLogins(to, options.issuer, keep)
      const stoppedDeliveries = await stopDeliveries(to)
      return { ok: true, migrations: applied.length, tables: tables.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), counts, maskedRows, linked, stoppedDeliveries }
    }, 'maintenance')
  }, 'maintenance')
}

/** Rewrites supported email patterns in text and JSON columns to stable aliases. */
export async function maskEmails(client: DatabaseClient, keep: string[]) {
  await client.query(`CREATE FUNCTION pg_temp.mask_emails(value text, keep text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
    DECLARE found text; offset_at integer; remaining text := value; result text := '';
    BEGIN
      IF value IS NULL OR position('@' IN value) = 0 THEN RETURN value; END IF;
      LOOP
        found := (regexp_match(remaining, '([A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\\.)+[A-Za-z]{2,})'))[1];
        EXIT WHEN found IS NULL;
        offset_at := strpos(remaining, found);
        result := result || left(remaining, offset_at - 1);
        remaining := substr(remaining, offset_at + length(found));
        IF lower(found) = ANY(keep) OR lower(found) LIKE '%@${maskedDomain}' THEN
          result := result || found;
        ELSE
          result := result || 'u-' || left(md5(lower(found)), 16) || '@${maskedDomain}';
        END IF;
      END LOOP;
      RETURN result || remaining;
    END $$`)
  const { rows: columns } = await client.query<{ table: string; column: string; kind: string }>(
    `SELECT c.relname AS table, a.attname AS column, t.typname AS kind FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_type t ON t.oid = a.atttypid
     WHERE n.nspname = 'app' AND c.relkind IN ('r','p') AND c.relname <> 'schema_migrations' AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attgenerated = '' AND t.typname IN ('text','varchar','bpchar','citext','json','jsonb','_text') ORDER BY 1, 2`)
  let masked = 0
  for (const { table, column, kind } of columns) {
    const name = quoted(column), target = `app.${quoted(table)}`
    const sql = kind === 'json' || kind === 'jsonb' ? `UPDATE ${target} SET ${name} = pg_temp.mask_emails(${name}::text, $1)::${kind} WHERE ${name}::text LIKE '%@%'`
      : kind === '_text' ? `UPDATE ${target} SET ${name} = (SELECT array_agg(pg_temp.mask_emails(x, $1) ORDER BY i) FROM unnest(${name}) WITH ORDINALITY AS u(x, i)) WHERE array_to_string(${name}, ' ') LIKE '%@%'`
      : `UPDATE ${target} SET ${name} = pg_temp.mask_emails(${name}, $1) WHERE ${name} LIKE '%@%'`
    masked += (await client.query(sql, [keep])).rowCount ?? 0
  }
  return masked
}

/** Every copied account moves to the dev pool's issuer. Only kept accounts get a dev subject; the rest can never be signed in to. */
async function relinkLogins(client: DatabaseClient, issuer: string, keep: KeptAccount[]) {
  await client.query("UPDATE app.users SET cognito_issuer = $1, cognito_subject = 'prod-copy-' || md5(cognito_issuer || ' ' || cognito_subject)", [issuer])
  let linked = 0
  for (const account of keep) if (account.subject) linked += (await client.query('UPDATE app.users SET cognito_subject = $2 WHERE cognito_issuer = $1 AND lower(email) = $3', [issuer, account.subject, account.email])).rowCount ?? 0
  return linked
}

async function stopDeliveries(client: DatabaseClient) {
  const { rows } = await client.query<{ table: string }>(
    "SELECT c.relname AS table FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND a.attname = 'lease_token' AND NOT a.attisdropped")
  const unknown = rows.map(r => r.table).filter(t => !deliveryQueues.some(q => q.table === t))
  if (unknown.length) throw new Error(`Unreviewed delivery queue ${unknown.join(', ')}; add it to deliveryQueues`)
  let stopped = 0
  for (const q of deliveryQueues) if (rows.some(r => r.table === q.table)) {
    stopped += (await client.query(`UPDATE app.${quoted(q.table)} SET ${quoted(q.column)} = $1, lease_token = NULL, lease_until = NULL WHERE ${quoted(q.column)} = ANY($2)`, [q.stopped, q.active])).rowCount ?? 0
  }
  return stopped
}
