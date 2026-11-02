import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from './client'

/** One email outbox table: its status column, waiting status, delivery timestamp and feedback link. */
export interface LeasedOutbox { table: string; status: string; pending: string; deliveredAt: string; feedbackColumn: string; suppressedOutcome: string }
export interface LeaseAck { organizationId: string; id: string; leaseToken: string; outcome: string }
export const setOrganization = (client: DatabaseClient, organizationId: string) => client.query("SELECT set_config('app.organization_id',$1,true)", [organizationId])

/** Records a send outcome for a still-held lease; bounce/complaint feedback overrides it. */
export async function acknowledgeLease(client: DatabaseClient, outbox: LeasedOutbox, request: LeaseAck) {
  const { table, status, pending, deliveredAt } = outbox
  await setOrganization(client, request.organizationId)
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['mail-feedback:' + request.id])
  const suppressed = (await client.query(`SELECT 1 FROM app.email_feedback_events WHERE ${outbox.feedbackColumn}=$1 LIMIT 1`, [request.id])).rows.length
  const result = await client.query(`UPDATE app.${table} SET ${status}=CASE WHEN $4='retry' THEN CASE WHEN attempts>=5 THEN 'failed' ELSE '${pending}' END ELSE $4 END,next_attempt_at=now()+LEAST(3600,power(2,attempts)*60)*interval '1 second',${deliveredAt}=CASE WHEN $4='sent' THEN now() ELSE ${deliveredAt} END,lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND id=$2 AND lease_token=$3 AND ${status}='sending' RETURNING id`,
    [request.organizationId, request.id, request.leaseToken, suppressed ? outbox.suppressedOutcome : request.outcome])
  return { updated: result.rows.length === 1 }
}

export interface ClaimSteps<Org, Job> {
  organizations: string
  /** Runs in each organization before expired leases are released. */
  prepare?: (org: Org) => Promise<unknown>
  /** Marks undeliverable rows; runs before the five-job cap unless cleanupWhenFull is false. */
  cleanup: (org: Org) => Promise<unknown>
  cleanupWhenFull?: boolean
  /** Selects up to $2 deliverable rows of organization $1 with FOR UPDATE SKIP LOCKED. */
  select: string
  job: (row: { id: string } & Record<string, unknown>, org: Org, leaseToken: string) => Job
}
/** Leases up to five jobs across organizations, each inside its own RLS context. */
export async function claimLeases<Org extends { id: string }, Job>(client: DatabaseClient, outbox: LeasedOutbox, steps: ClaimSteps<Org, Job>) {
  const { table, status } = outbox, jobs: Job[] = []
  for (const org of (await client.query(steps.organizations)).rows as Org[]) {
    await setOrganization(client, org.id)
    await steps.prepare?.(org)
    await client.query(`UPDATE app.${table} SET ${status}='uncertain',lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND ${status}='sending' AND lease_until<now()`, [org.id])
    if (steps.cleanupWhenFull !== false) await steps.cleanup(org)
    if (jobs.length >= 5) continue
    if (steps.cleanupWhenFull === false) await steps.cleanup(org)
    for (const row of (await client.query(steps.select, [org.id, 5 - jobs.length])).rows) {
      const leaseToken = randomUUID()
      await client.query(`UPDATE app.${table} SET ${status}='sending',attempts=attempts+1,lease_token=$3,lease_until=now()+interval '5 minutes' WHERE organization_id=$1 AND id=$2`, [org.id, row.id, leaseToken])
      jobs.push(steps.job(row, org, leaseToken))
    }
  }
  return jobs
}
