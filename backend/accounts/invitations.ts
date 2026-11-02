import type {DatabaseClient} from '../database/client'
import {ApiError,object} from '../database/api-validation'
import {inviteMember,versioned} from './validation'
import type {AccountRequest} from './routes'
import {pageOf,requestHash} from '../database/repository-utils'
export const invitationColumns='id,email,display_name AS "displayName",role,status,delivery_status AS "deliveryStatus",attempts,expires_at AS "expiresAt",version,created_at AS "createdAt"'
export async function dispatchInvitations(client:DatabaseClient,request:AccountRequest,actor:{id:string;role:string}) {
  const org=request.organizationId
  const get=async(id:string)=>{const v=(await client.query(`SELECT ${invitationColumns} FROM app.organization_invitations WHERE organization_id=$1 AND id=$2`,[org,id])).rows[0];if(!v)throw new ApiError(404,'Invitation not found');return v}
  if(request.method==='GET') {
    const {rows}=await client.query(`SELECT ${invitationColumns} FROM app.organization_invitations WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,[org,request.page.after,request.page.limit+1])
    return pageOf(rows,request.page.limit)
  }
  const input=request.invitationId?versioned(object(request.body,['version','requestId'])):inviteMember(request.body)
  const hash=requestHash({input,id:request.invitationId,action:request.action})
  const previous=(await client.query('SELECT target_id,request_hash FROM app.organization_audit_events WHERE organization_id=$1 AND actor_id=$2 AND request_id=$3',[org,actor.id,input.requestId])).rows[0]
  if(previous){if(previous.request_hash!==hash)throw new ApiError(409,'Request ID already used for another action');return get(previous.target_id)}
  let id=request.invitationId,kind=''
  if(!id) {
    const v=inviteMember(request.body)
    if(v.role==='admin'&&actor.role!=='owner')throw new ApiError(403,'Only an owner can invite an administrator')
    const existing=await client.query("SELECT 1 FROM app.users u JOIN app.organization_memberships m ON m.user_id=u.id WHERE m.organization_id=$1 AND lower(u.email)=$2 AND m.status IN ('active','suspended')",[org,v.email])
    if(existing.rows.length)throw new ApiError(409,'Manage the existing organization member instead')
    await client.query("UPDATE app.organization_invitations SET status='expired',version=version+1 WHERE organization_id=$1 AND email=$2 AND status='pending' AND expires_at<=now()",[org,v.email])
    id=(await client.query('INSERT INTO app.organization_invitations(organization_id,email,display_name,role,created_by,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[org,v.email,v.displayName,v.role,actor.id,v.requestId,hash])).rows[0].id;kind='invitation_created'
  } else {
    const current=await get(id),v=versioned(object(request.body,['version','requestId']))
    if(current.role==='admin'&&actor.role!=='owner')throw new ApiError(403,'Only an owner can manage administrator invitations')
    if(current.version!==v.version||current.status!=='pending'||Date.parse(String(current.expiresAt))<=Date.now())throw new ApiError(409,'Invitation changed, expired or is no longer pending')
    if(request.action==='revoke'){await client.query("UPDATE app.organization_invitations SET status='revoked',version=version+1 WHERE organization_id=$1 AND id=$2",[org,id]);kind='invitation_revoked'}
    else if(request.action==='retry') {
      if(!['failed','uncertain'].includes(current.deliveryStatus))throw new ApiError(409,'Only failed or uncertain delivery can be retried')
      await client.query("UPDATE app.organization_invitations SET delivery_status='queued',attempts=0,next_attempt_at=now(),lease_token=NULL,lease_until=NULL,version=version+1 WHERE organization_id=$1 AND id=$2",[org,id]);kind='invitation_retried'
    } else throw new ApiError(404,'Invitation action not found')
  }
  const invitation=await get(id!)
  await client.query('INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[org,actor.id,kind,id,{email:invitation.email,role:invitation.role},input.requestId,hash])
  return invitation
}
