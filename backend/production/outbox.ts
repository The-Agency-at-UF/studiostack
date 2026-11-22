import { inTransaction, type DatabaseClient } from '../database/client'
import { acknowledgeLease, claimLeases, startLease, type LeasedOutbox } from '../database/leased-outbox'
import { object, uuid } from '../database/api-validation'

export interface NotificationLease {
  id: string
  organizationId: string
  briefId: string
  recipientSubject: string
  recipientIssuer: string
  leaseToken: string
}

export interface NotificationPayload {
  projectName: string
  client: string
  decision: string
  comment: string
  section: string
  version: number
  deliveryDate: string
  shootStartsAt: string | null
  shootEndsAt: string | null
  reviewer?: string
}

export interface NotificationJob extends NotificationLease { payload: NotificationPayload }

type LeaseRef = Pick<NotificationLease,'organizationId'|'id'|'leaseToken'>
export type OutboxRequest = { action: 'claim' } | ({ action: 'authorize' } & LeaseRef) |
  ({ action: 'ack'; outcome: 'sent' | 'retry' | 'failed' | 'uncertain' | 'skipped' } & LeaseRef)

export function parseOutboxRequest(input: unknown): OutboxRequest {
  const v = object(input, ['action','organizationId','id','leaseToken','outcome'])
  if (v.action === 'claim') { object(input, ['action']); return { action: 'claim' } }
  const lease = { organizationId: uuid(v.organizationId), id: uuid(v.id), leaseToken: uuid(v.leaseToken) }
  if (v.action === 'authorize') {
    object(input, ['action','organizationId','id','leaseToken'])
    return { action: 'authorize', ...lease }
  }
  if (v.action !== 'ack' || !['sent','retry','failed','uncertain','skipped'].includes(String(v.outcome))) throw new Error('Invalid outbox task')
  return { action: 'ack', ...lease, outcome: v.outcome as Extract<OutboxRequest,{action:'ack'}>['outcome'] }
}

/** Eligibility for a production_outbox row aliased as o. An author can still see their own reopened draft. */
export const decisionRecipientEligible = `EXISTS (
  SELECT 1 FROM app.production_briefs b
  JOIN app.organization_memberships m ON m.organization_id=b.organization_id AND m.user_id=o.recipient_id
  JOIN app.users u ON u.id=m.user_id AND u.deletion_requested_at IS NULL
  LEFT JOIN app.production_settings s ON s.organization_id=b.organization_id
  WHERE b.organization_id=o.organization_id AND b.id=o.brief_id AND b.deleted_at IS NULL
    AND m.status='active'
    AND (b.owner_id=o.recipient_id OR (b.status<>'draft' AND o.recipient_id=ANY(s.executive_ids)))
)`

const productionOutbox: LeasedOutbox = { table: 'production_outbox', status: 'status', pending: 'pending', deliveredAt: 'sent_at', feedbackColumn: 'delivery_id', suppressedOutcome: 'failed' }
export interface OutboxResult { jobs?: NotificationLease[]; allowed?: boolean; payload?: NotificationPayload; updated?: boolean; skippedBeforeClaim?:number }

export async function outboxTask(client: DatabaseClient, request: OutboxRequest): Promise<OutboxResult> {
  return inTransaction(client, async () => {
    if (request.action === 'ack') return acknowledgeLease(client, productionOutbox, request)
    if (request.action === 'authorize') {
      if(!await startLease(client,productionOutbox,request,decisionRecipientEligible))return {allowed:false}
      const {rows:[row]} = await client.query<{payload:NotificationPayload}>(`
        SELECT o.payload || jsonb_build_object('comment',e.comment,'section',e.section) AS payload
        FROM app.production_outbox o
        JOIN app.production_brief_events e ON e.organization_id=o.organization_id AND e.id=o.event_id AND e.brief_id=o.brief_id
        WHERE o.organization_id=$1 AND o.id=$2 AND o.lease_token=$3
          AND o.status='sending' AND o.lease_until>now() AND ${decisionRecipientEligible}
      `, [request.organizationId,request.id,request.leaseToken])
      return row ? {allowed:true,payload:row.payload} : {allowed:false}
    }

    let skippedBeforeClaim=0
    const jobs=await claimLeases<{ id: string }, NotificationLease>(client, productionOutbox, {
      organizations: 'SELECT id FROM app.organizations ORDER BY id',
      cleanup: async org=>{
        const result=await client.query(`UPDATE app.production_outbox o SET status='skipped'
          WHERE organization_id=$1 AND status='pending' AND NOT ${decisionRecipientEligible}`,[org.id])
        skippedBeforeClaim+=result.rowCount??0
      },
      select: `SELECT o.id, o.brief_id AS "briefId", u.cognito_subject AS "recipientSubject", u.cognito_issuer AS "recipientIssuer"
        FROM app.production_outbox o JOIN app.users u ON u.id=o.recipient_id
        WHERE o.organization_id=$1 AND o.status='pending' AND o.next_attempt_at<=now() AND o.attempts<5 AND ${decisionRecipientEligible}
        ORDER BY o.next_attempt_at,o.id LIMIT $2 FOR UPDATE OF o SKIP LOCKED`,
      job: (row, org, leaseToken) => ({ ...row, organizationId: org.id, leaseToken }) as NotificationLease,
    })
    return {jobs,...(skippedBeforeClaim?{skippedBeforeClaim}:{})}
  })
}
