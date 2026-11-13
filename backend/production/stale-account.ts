import type { createDatabase } from '../database/client'
import type { DatabaseConfig } from '../database/config'
import { createHash, randomUUID } from 'node:crypto'
import { object } from '../database/api-validation'

// Approved by Roger on 2026-11-13. His UF sign-in was recreated on 2026-11-04, so the account it
// registered has no email while an older account, whose sign-in no longer exists, still holds it
// and still owns The Agency at UF. Only this address may be repaired by this action.
export const approvedRepairEmail = 'rmckenzie1@ufl.edu'
const subjectPattern = /^[a-f0-9-]{36}$/
type Account = { id: string; subject: string; email: string | null }
type Membership = { organization_id: string; role: string; status: string }

/**
 * IAM-only. Moves the approved email from a stale account to the account the live sign-in uses,
 * then suspends the stale account's memberships so it can no longer act or be mistaken for the
 * person. Nothing is deleted: history stays attached to the stale account.
 *
 * `staleSubject` must be confirmed absent from Cognito by the caller first. Without `apply`, the
 * action only reports what it would change.
 */
export async function retireStaleAccount(database: ReturnType<typeof createDatabase>, config: DatabaseConfig, input: unknown) {
  const v = object(input, ['action', 'current', 'staleSubject', 'apply'])
  if (!(config.environment === 'dev' || config.environment === 'prod' && process.env.ALLOW_PRODUCTION_OWNER_BOOTSTRAP === 'yes') || !process.env.COGNITO_USER_POOL_ID) throw new Error('Approved account repair required')
  const current = object(v.current, ['subject', 'email'])
  if (current.email !== approvedRepairEmail || typeof current.subject !== 'string' || !subjectPattern.test(current.subject)) throw new Error('Approved account repair required')
  if (v.staleSubject != null && (typeof v.staleSubject !== 'string' || !subjectPattern.test(v.staleSubject))) throw new Error('Approved account repair required')
  if (v.apply !== undefined && typeof v.apply !== 'boolean') throw new Error('Approved account repair required')
  const issuer = `https://cognito-idp.us-east-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
  const email = approvedRepairEmail

  return database.transaction(async client => {
    // Same lock app.claim_account_email takes, so a concurrent sign-in cannot claim the email mid-repair.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`account-email:${issuer}:${email}`])
    const live = (await client.query<Account>('SELECT id,cognito_subject AS subject,email FROM app.users WHERE cognito_issuer=$1 AND cognito_subject=$2 FOR UPDATE', [issuer, current.subject])).rows[0]
    if (!live) throw new Error('The live sign-in has no account yet')
    const stale = (await client.query<Account>('SELECT id,cognito_subject AS subject,email FROM app.users WHERE cognito_issuer=$1 AND email=$2 AND id<>$3 FOR UPDATE', [issuer, email, live.id])).rows[0]
    if (!stale) return { ok: true, changed: false, liveAccount: live.id, liveHasEmail: live.email === email, staleAccount: null }
    if (stale.subject === current.subject) throw new Error('Stale account uses the live sign-in')
    const memberships = (await client.query<Membership>('SELECT organization_id,role,status FROM app.organization_memberships WHERE user_id=$1 ORDER BY organization_id FOR UPDATE', [stale.id])).rows
    const plan = { liveAccount: live.id, staleAccount: stale.id, staleSubject: stale.subject, memberships: memberships.map(m => ({ organizationId: m.organization_id, role: m.role, status: m.status })) }
    // Applying needs the caller to have confirmed this exact sign-in is gone from Cognito.
    if (!v.apply) return { ok: true, changed: false, ...plan }
    if (v.staleSubject !== stale.subject) throw new Error('Confirm the stale sign-in is deleted before applying')

    await client.query('UPDATE app.users SET email=NULL WHERE id=$1', [stale.id])
    await client.query('UPDATE app.users SET email=$2 WHERE id=$1', [live.id, email])
    for (const m of memberships) {
      if (m.status !== 'suspended' || m.role !== 'member') {
        await client.query("UPDATE app.organization_memberships SET role='member',status='suspended',version=version+1 WHERE organization_id=$1 AND user_id=$2", [m.organization_id, stale.id])
        // Retiring an active owner must leave the organization another active owner.
        const owners = m.role === 'owner' && m.status === 'active' ? (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM app.organization_memberships WHERE organization_id=$1 AND role='owner' AND status='active'", [m.organization_id])).rows[0].count : 1
        if (owners < 1) throw new Error('Keep at least one active organization owner')
        // Audit actors must belong to the organization; the live account does when it is a member.
        const liveMember = (await client.query('SELECT 1 FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2', [m.organization_id, live.id])).rows.length > 0
        const body = JSON.stringify({ fromRole: m.role, role: 'member', fromStatus: m.status, status: 'suspended', reason: 'stale-sign-in-retired', source: 'maintenance' })
        await client.query("INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details,request_id,request_hash) VALUES($1,$2,'member_updated',$3,$4,$5,$6)",
          [m.organization_id, liveMember ? live.id : stale.id, stale.id, body, randomUUID(), createHash('sha256').update(`${stale.id}:${body}`).digest('hex')])
      }
    }
    return { ok: true, changed: true, ...plan }
  }, 'maintenance')
}
