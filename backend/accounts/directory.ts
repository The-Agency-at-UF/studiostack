import {createHash} from 'node:crypto'
import type {DatabaseClient} from '../database/client'
import {ApiError,object,text,uuid} from '../database/api-validation'
import {onboardingTask} from './onboarding'
export const directoryActions=['list','accept','overview','join-domain','join-code','request-access','withdraw-request'] as const
export interface DirectoryRequest {action:typeof directoryActions[number];identity:{issuer:string;subject:string;email:string};invitationId?:string;organizationId?:string;code?:string;message?:string;requestId?:string}
const organizationActions=['accept','join-domain','request-access','withdraw-request']
export function directoryRequest(input:unknown,pool:string):DirectoryRequest {
  const v=object(input,['action','identity','invitationId','organizationId','code','message','requestId']),identity=object(v.identity,['issuer','subject','email'])
  if(!directoryActions.includes(v.action as DirectoryRequest['action'])||identity.issuer!==`https://cognito-idp.us-east-2.amazonaws.com/${pool}`)throw new ApiError(400,'Invalid directory operation')
  const action=v.action as DirectoryRequest['action'],email=text(identity.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'A verified email is required')
  return {action,identity:{issuer:String(identity.issuer),subject:uuid(identity.subject),email},
    ...(organizationActions.includes(action)?{organizationId:uuid(v.organizationId)}:{}),...(action==='accept'?{invitationId:uuid(v.invitationId)}:{}),
    ...(action==='join-code'?{code:text(v.code,32)}:{}),...(action==='request-access'&&v.message!==undefined?{message:text(v.message,500)}:{}),...(action==='withdraw-request'?{requestId:uuid(v.requestId)}:{})}
}
async function invitationTask(client:DatabaseClient,request:DirectoryRequest,user:{id:string}) {
  const {identity}=request
  const organizations=(await client.query('SELECT id,name FROM app.organizations WHERE ($1::uuid IS NULL OR id=$1) ORDER BY id',[request.organizationId??null])).rows,items=[]
  let accepted:unknown
  for(const org of organizations) {
    await client.query("SELECT set_config('app.organization_id',$1,true)",[org.id])
    if(request.action==='accept')await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`organization-admin:${org.id}`])
    const rows=(await client.query(`SELECT i.*,m.role AS inviter_role,m.status AS inviter_status FROM app.organization_invitations i JOIN app.organization_memberships m ON m.organization_id=i.organization_id AND m.user_id=i.created_by WHERE i.organization_id=$1 AND i.email=$2 AND ($3::uuid IS NULL OR i.id=$3)`,[org.id,identity.email,request.invitationId??null])).rows
    for(const invitation of rows) {
      if(invitation.status==='accepted'&&invitation.accepted_by===user.id&&request.action==='accept'){accepted={organizationId:org.id};continue}
      if(invitation.status!=='pending'||Date.parse(String(invitation.expires_at))<=Date.now()||invitation.inviter_status!=='active'||!['owner','admin'].includes(invitation.inviter_role)||(invitation.role==='admin'&&invitation.inviter_role!=='owner'))continue
      if(request.action!=='accept'){items.push({id:invitation.id,organizationId:org.id,organizationName:org.name,role:invitation.role,displayName:invitation.display_name,expiresAt:invitation.expires_at});continue}
      const existing=(await client.query('SELECT role,status FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2',[org.id,user.id])).rows[0]
      if(existing&&existing.status!=='active')throw new ApiError(409,'Ask an administrator to restore the existing membership')
      if(!existing)await client.query("INSERT INTO app.organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,$3,'active')",[org.id,user.id,invitation.role])
      await client.query("UPDATE app.organization_invitations SET status='accepted',accepted_by=$3,accepted_at=now(),version=version+1 WHERE organization_id=$1 AND id=$2",[org.id,invitation.id,user.id])
      const hash=createHash('sha256').update(`accept:${invitation.id}:${user.id}`).digest('hex')
      await client.query("INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details,request_id,request_hash) VALUES($1,$2,'invitation_accepted',$3,$4,$3,$5)",[org.id,user.id,invitation.id,{role:existing?.role??invitation.role},hash]);accepted={organizationId:org.id}
    }
  }
  if(request.action==='accept'&&!accepted)throw new ApiError(404,'Invitation is unavailable for this verified account')
  return request.action==='accept'?accepted:{items}
}
/** IAM-only verified directory input. Never use an email supplied by HTTP bodies. */
export async function directoryTask(client:DatabaseClient,request:DirectoryRequest) {
  await client.query('BEGIN')
  try {
    const {identity}=request
    const user=(await client.query('SELECT id,display_name AS "displayName" FROM app.users WHERE cognito_issuer=$1 AND cognito_subject=$2',[identity.issuer,identity.subject])).rows[0]
    if(!user)throw new ApiError(404,'Sign in and register the account before accepting invitations')
    await client.query('UPDATE app.users SET email=$2 WHERE id=$1',[user.id,identity.email])
    const result=['list','accept'].includes(request.action)?await invitationTask(client,request,user)
      :await onboardingTask(client,request,user,async()=>((await invitationTask(client,{...request,action:'list'},user)) as {items:unknown[]}).items)
    await client.query('COMMIT');return result
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(error instanceof ApiError)return {statusCode:error.status,error:error.message};throw error}
}
