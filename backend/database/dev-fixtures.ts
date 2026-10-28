import { createHash } from 'node:crypto'
import { createDatabase } from './client'
import { databaseConfig } from './config'
import { uuid } from './api-validation'

/** Temporary IAM-only maintenance. Fixed dev-fixture operations, never public SQL. */
export async function fixtures(event: { action: 'seed' | 'digest' | 'cleanup'; organizationId: string; otherOrganizationId: string; issuer: string; subjects: string[]; restoreHost?: string }) {
  const config = databaseConfig()
  if (config.environment !== 'dev' || process.env.APPLY_DATABASE_API_SCHEMA !== 'yes') throw new Error('Dev maintenance only')
  const run = process.env.FIXTURE_RUN_ID
  if (!run || !/^\d{8}-[a-f0-9]{8}$/.test(run)) throw new Error('Isolated fixture run required')
  const ids = [uuid(event.organizationId), uuid(event.otherOrganizationId)]
  const issuer = `https://cognito-idp.us-east-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
  if (event.issuer !== issuer || event.subjects.length !== 3 || event.subjects.some(s => !/^[a-f0-9-]{36}$/.test(s))) throw new Error('Expected dev test identities required')
  if (event.restoreHost) {
    if (event.action !== 'digest' || !new RegExp(`^studiostack-dev-restore-${run}\\.cluster-[a-z0-9]+\\.us-east-2\\.rds\\.amazonaws\\.com$`).test(event.restoreHost)) throw new Error('Unexpected temporary restore host')
    config.host = event.restoreHost
    // The restored app login comes from the snapshot. It uses the existing dev
    // app secret, not the source master password or a new master credential.
    config.secretArn = process.env.RDS_APP_SECRET_ARN!
  }
  const database = createDatabase(config)
  return database.transaction(async client => {
    if (event.action === 'seed') {
      for (let i = 0; i < ids.length; i++) await client.query('INSERT INTO app.organizations (id, slug, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [ids[i], `dev-drill-${run}-${i}`, `Synthetic dev verification ${run} ${i}`])
      for (let i = 0; i < event.subjects.length; i++) {
        const user = await client.query<{ id: string }>('INSERT INTO app.users (cognito_issuer, cognito_subject, display_name) VALUES ($1, $2, $3) ON CONFLICT (cognito_issuer, cognito_subject) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id', [issuer, event.subjects[i], `Synthetic ${['owner', 'member', 'outsider'][i]}`])
        await client.query('INSERT INTO app.organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [i === 2 ? ids[1] : ids[0], user.rows[0].id, i === 1 ? 'member' : 'owner', 'active'])
      }
      return { ok: true, action: 'seed' }
    }
    const ownership = await client.query<{ id: string }>('SELECT id FROM app.organizations WHERE id = ANY($1::uuid[]) AND slug LIKE $2', [ids, `dev-drill-${run}-%`])
    if (ownership.rows.length !== 2) throw new Error('Fixture ownership mismatch')
    if (event.action === 'cleanup') {
      // Exact run-owned fixtures only, in FK order. Production is forbidden above.
      for (const table of ['user_alerts','alert_preferences','equipment_events','equipment_checkouts','equipment_reports','organization_audit_events', 'organization_invitations', 'production_outbox', 'production_brief_events', 'production_attachments', 'production_briefs', 'production_settings', 'reservation_items', 'reservations', 'inventory', 'photo_uploads', 'user_group_memberships', 'user_groups', 'organization_memberships']) await client.query(`DELETE FROM app.${table} WHERE organization_id = ANY($1::uuid[])`, [ids])
      await client.query('DELETE FROM app.organizations WHERE id = ANY($1::uuid[])', [ids])
      await client.query('DELETE FROM app.users u WHERE cognito_issuer = $1 AND cognito_subject = ANY($2::text[]) AND NOT EXISTS (SELECT 1 FROM app.organization_memberships m WHERE m.user_id = u.id)', [issuer, event.subjects])
      return { ok: true, action: 'cleanup' }
    }
    if (event.action !== 'digest') throw new Error('Unsupported maintenance action')
    const counts: Record<string, number> = {}, hashes: Record<string, string> = {}
    const users = await client.query('SELECT to_jsonb(u) AS value FROM app.users u WHERE cognito_issuer = $1 AND cognito_subject = ANY($2::text[])', [issuer, event.subjects])
    counts.users = users.rows.length
    hashes.users = createHash('sha256').update(users.rows.map(r => JSON.stringify(r.value)).sort().join('\n')).digest('hex')
    for (const table of ['organizations', 'organization_memberships', 'user_groups', 'inventory', 'reservations', 'reservation_items', 'photo_uploads']) {
      const values: unknown[] = []
      for (const id of ids) {
        await client.query("SELECT set_config('app.organization_id', $1, true)", [id])
        const rows = await client.query(`SELECT to_jsonb(t) AS value FROM app.${table} t WHERE ${table === 'organizations' ? 'id' : 'organization_id'} = $1::uuid`, [id])
        values.push(...rows.rows.map(r => r.value))
      }
      const serialized = values.map(r => JSON.stringify(r)).sort()
      counts[table] = values.length
      hashes[table] = createHash('sha256').update(serialized.join('\n')).digest('hex')
    }
    const columns = await client.query("SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'app' AND table_name <> 'schema_migrations' ORDER BY table_name, ordinal_position")
    const tls = await client.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')
    return { ok: true, action: 'digest', counts, hashes, columns: columns.rows, tls: tls.rows[0]?.ssl === true }
  }, 'maintenance')
}
