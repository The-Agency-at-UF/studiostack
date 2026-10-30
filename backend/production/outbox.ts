import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../database/client'
import { createDatabase } from '../database/client'
import { databaseConfig } from '../database/config'
import { object, uuid } from '../database/api-validation'
export interface NotificationJob { id: string; organizationId: string; briefId: string; recipientSubject: string; recipientIssuer: string; payload: { projectName: string; client: string; decision: string; comment: string; section: string; version: number; deliveryDate: string; shootStartsAt: string | null; shootEndsAt: string | null; reviewer?: string }; leaseToken: string }
export type OutboxRequest = { action: 'claim' } | { action: 'ack'; organizationId: string; id: string; leaseToken: string; outcome: 'sent' | 'retry' | 'failed' | 'uncertain' }
export function parseOutboxRequest(input: unknown): OutboxRequest {
  const v = object(input, ['action','organizationId','id','leaseToken','outcome'])
  if (v.action === 'claim') { object(input,['action']); return { action: 'claim' } }
  if (v.action !== 'ack' || !['sent','retry','failed','uncertain'].includes(String(v.outcome))) throw new Error('Invalid outbox task')
  return { action: 'ack', organizationId: uuid(v.organizationId), id: uuid(v.id), leaseToken: uuid(v.leaseToken), outcome: v.outcome as 'sent' | 'retry' | 'failed' | 'uncertain' }
}
export async function outboxTask(client: DatabaseClient, request: OutboxRequest): Promise<{ jobs?: NotificationJob[]; updated?: boolean }> {
  await client.query('BEGIN')
  try {
    if (request.action === 'ack') {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [request.organizationId])
      const result = await client.query(`UPDATE app.production_outbox SET status = CASE WHEN $4 = 'retry' THEN CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END ELSE $4 END,
        next_attempt_at = now() + (LEAST(3600, power(2, attempts) * 60) * interval '1 second'), sent_at = CASE WHEN $4 = 'sent' THEN now() ELSE sent_at END,
        lease_until = NULL, lease_token = NULL WHERE organization_id = $1 AND id = $2 AND lease_token = $3 AND status = 'sending' RETURNING id`, [request.organizationId, request.id, request.leaseToken, request.outcome])
      await client.query('COMMIT'); return { updated: result.rows.length === 1 }
    }
    // No cross-tenant bypass role: each organization is processed in its RLS context.
    const organizations = await client.query('SELECT id FROM app.organizations ORDER BY id')
    const jobs: NotificationJob[] = []
    for (const org of organizations.rows) {
      await client.query("SELECT set_config('app.organization_id', $1, true)", [org.id])
      await client.query("UPDATE app.production_outbox SET status = 'uncertain', lease_until = NULL, lease_token = NULL WHERE organization_id = $1 AND status = 'sending' AND lease_until < now()", [org.id])
      if (jobs.length >= 5) continue
      await client.query("UPDATE app.production_outbox o SET status = 'failed' WHERE organization_id = $1 AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = o.organization_id AND m.user_id = o.recipient_id AND m.status = 'active')", [org.id])
      const rows = await client.query(`SELECT o.id, o.brief_id AS "briefId", u.cognito_subject AS "recipientSubject", u.cognito_issuer AS "recipientIssuer", o.payload FROM app.production_outbox o JOIN app.users u ON u.id = o.recipient_id WHERE o.organization_id = $1 AND o.status = 'pending' AND o.next_attempt_at <= now() AND o.attempts < 5 ORDER BY o.next_attempt_at, o.id LIMIT $2 FOR UPDATE OF o SKIP LOCKED`, [org.id, 5 - jobs.length])
      for (const row of rows.rows) {
        const leaseToken = randomUUID()
        await client.query("UPDATE app.production_outbox SET status = 'sending', attempts = attempts + 1, lease_token = $3, lease_until = now() + interval '5 minutes' WHERE organization_id = $1 AND id = $2", [org.id, row.id, leaseToken])
        jobs.push({ ...row, organizationId: org.id, leaseToken } as NotificationJob)
      }
    }
    await client.query('COMMIT'); return { jobs }
  } catch (error) { await client.query('ROLLBACK').catch(()=>undefined); throw error }
}
/** IAM-only maintenance path. This export is never an API Gateway route. */
export async function handler(input: unknown) {
  if (process.env.PRODUCTION_OUTBOX_STORE !== 'yes') throw new Error('Outbox store is not enabled')
  const request = parseOutboxRequest(input)
  return createDatabase(databaseConfig()).withClient(client => outboxTask(client,request))
}
