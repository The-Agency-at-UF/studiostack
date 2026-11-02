import { createDatabase, inTransaction, type DatabaseClient } from '../database/client'
import { acknowledgeLease, claimLeases, type LeasedOutbox } from '../database/leased-outbox'
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
const productionOutbox: LeasedOutbox = { table: 'production_outbox', status: 'status', pending: 'pending', deliveredAt: 'sent_at', feedbackColumn: 'delivery_id', suppressedOutcome: 'failed' }
export async function outboxTask(client: DatabaseClient, request: OutboxRequest): Promise<{ jobs?: NotificationJob[]; updated?: boolean }> {
  return inTransaction(client, async () => {
    if (request.action === 'ack') return acknowledgeLease(client, productionOutbox, request)
    // No cross-tenant bypass role: each organization is processed in its RLS context.
    return { jobs: await claimLeases<{ id: string }, NotificationJob>(client, productionOutbox, {
      organizations: 'SELECT id FROM app.organizations ORDER BY id',
      cleanupWhenFull: false,
      cleanup: org => client.query("UPDATE app.production_outbox o SET status = 'failed' WHERE organization_id = $1 AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = o.organization_id AND m.user_id = o.recipient_id AND m.status = 'active')", [org.id]),
      select: `SELECT o.id, o.brief_id AS "briefId", u.cognito_subject AS "recipientSubject", u.cognito_issuer AS "recipientIssuer", o.payload FROM app.production_outbox o JOIN app.users u ON u.id = o.recipient_id WHERE o.organization_id = $1 AND o.status = 'pending' AND o.next_attempt_at <= now() AND o.attempts < 5 ORDER BY o.next_attempt_at, o.id LIMIT $2 FOR UPDATE OF o SKIP LOCKED`,
      job: (row, org, leaseToken) => ({ ...row, organizationId: org.id, leaseToken }) as NotificationJob,
    }) }
  })
}
/** IAM-only maintenance path. This export is never an API Gateway route. */
export async function handler(input: unknown) {
  if (process.env.PRODUCTION_OUTBOX_STORE !== 'yes') throw new Error('Outbox store is not enabled')
  const request = parseOutboxRequest(input)
  return createDatabase(databaseConfig()).withClient(client => outboxTask(client,request))
}
