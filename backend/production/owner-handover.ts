import type { createDatabase } from '../database/client'
import type { DatabaseConfig } from '../database/config'
import { object } from '../database/api-validation'

// Approved by Roger on 2026-10-31: the Gmail account owns The Agency at UF and the UF account becomes a member.
export const approvedAgencyOwnerEmail = 'mckenzieroger83@gmail.com'
export const approvedFormerOwnerEmail = 'rmckenzie1@ufl.edu'
type Identity = { subject: string; email: string }
const identity = (value: unknown, email: string): Identity => {
  const v = object(value, ['subject', 'email'])
  if (v.email !== email || typeof v.subject !== 'string' || !/^[a-f0-9-]{36}$/.test(v.subject)) throw new Error('Approved organization owner required')
  return { subject: v.subject, email: v.email }
}

/** IAM-only ownership handover; identities come from the Cognito pool, never from the app's stored emails. */
export async function handOverAgencyOwnership(database: ReturnType<typeof createDatabase>, config: DatabaseConfig, input: unknown) {
  const v = object(input, ['action', 'owner', 'formerOwner'])
  if (!(config.environment === 'dev' || config.environment === 'prod' && process.env.ALLOW_PRODUCTION_OWNER_BOOTSTRAP === 'yes') || !process.env.COGNITO_USER_POOL_ID) throw new Error('Approved organization owner required')
  const owner = identity(v.owner, approvedAgencyOwnerEmail), former = v.formerOwner == null ? null : identity(v.formerOwner, approvedFormerOwnerEmail)
  const issuer = `https://cognito-idp.us-east-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
  return database.transaction(async client => {
    const org = (await client.query<{ id: string }>("SELECT id FROM app.organizations WHERE slug='agency-uf'")).rows[0]
    if (!org) throw new Error('Agency organization not found')
    const userId = async (who: Identity) => (await client.query<{ id: string }>('SELECT id FROM app.users WHERE cognito_issuer=$1 AND cognito_subject=$2', [issuer, who.subject])).rows[0]?.id
    const ownerId = await userId(owner)
    // Registration happens on first sign-in; the new owner must have signed in to this environment once.
    if (!ownerId) throw new Error('New owner has not signed in yet')
    const membership = async (id: string) => (await client.query<{ role: string; status: string }>('SELECT role,status FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2', [org.id, id])).rows[0]
    const audit = (target: string, details: Record<string, unknown>) => client.query("INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details) VALUES($1,$2,'member_updated',$3,$4)", [org.id, ownerId, target, JSON.stringify({ ...details, source: 'maintenance' })])

    const before = await membership(ownerId)
    if (!before) await client.query("INSERT INTO app.organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'owner','active')", [org.id, ownerId])
    else if (before.role !== 'owner' || before.status !== 'active') await client.query("UPDATE app.organization_memberships SET role='owner',status='active',version=version+1 WHERE organization_id=$1 AND user_id=$2", [org.id, ownerId])
    if (before?.role !== 'owner' || before?.status !== 'active') await audit(ownerId, { fromRole: before?.role ?? null, role: 'owner', fromStatus: before?.status ?? null, status: 'active' })

    let formerMembership: { role: string; status: string } | null = null
    const formerId = former && await userId(former)
    if (formerId && formerId !== ownerId) {
      const current = await membership(formerId)
      if (current && current.role !== 'member') {
        await client.query("UPDATE app.organization_memberships SET role='member',version=version+1 WHERE organization_id=$1 AND user_id=$2", [org.id, formerId])
        await audit(formerId, { fromRole: current.role, role: 'member', fromStatus: current.status, status: current.status })
      }
      formerMembership = current ? { role: 'member', status: current.status } : null
    }
    const owners = (await client.query<{ count: number }>("SELECT count(*)::int AS count FROM app.organization_memberships WHERE organization_id=$1 AND role='owner' AND status='active'", [org.id])).rows[0].count
    if (owners < 1) throw new Error('Keep at least one active organization owner')
    return { ok: true, organizationId: org.id, owner: { role: 'owner', status: 'active' }, formerOwner: formerMembership, activeOwners: owners }
  }, 'maintenance')
}
