import {createHash} from 'node:crypto'
import {inTransaction,type DatabaseClient} from '../database/client'
import {ApiError,object,text,uuid} from '../database/api-validation'
import {onboardingTask} from './onboarding'
import {emailPattern} from '../../src/types/patterns'
export const directoryActions=['list','accept','overview','join-domain','join-code','request-access','withdraw-request'] as const
export interface PreviousSignIn {subject:string;state:'deleted'|'active'}
export interface DirectoryRequest {action:typeof directoryActions[number];identity:{issuer:string;subject:string;email:string};previousSignIn?:PreviousSignIn;invitationId?:string;organizationId?:string;code?:string;message?:string;requestId?:string}
/** Returned instead of a result when another sign-in's account holds the verified email. */
export interface AccountClaim {statusCode:409;error:string;accountClaim:{previousSubject:string}}
export const emailInUse='This email is linked to another StudioStack sign-in. Ask your workspace administrator for help.'
const organizationActions=['accept','join-domain','request-access','withdraw-request']
export function directoryRequest(input:unknown,pool:string):DirectoryRequest {
  const v=object(input,['action','identity','previousSignIn','invitationId','organizationId','code','message','requestId']),identity=object(v.identity,['issuer','subject','email'])
  if(!directoryActions.includes(v.action as DirectoryRequest['action'])||identity.issuer!==`https://cognito-idp.us-east-2.amazonaws.com/${pool}`)throw new ApiError(400,'Invalid directory operation')
  const action=v.action as DirectoryRequest['action'],email=text(identity.email,254).toLowerCase();if(!emailPattern.test(email))throw new ApiError(400,'A verified email is required')
  const previous=v.previousSignIn===undefined?undefined:object(v.previousSignIn,['subject','state'])
  if(previous&&!['deleted','active'].includes(String(previous.state)))throw new ApiError(400,'Invalid directory operation')
  return {action,identity:{issuer:String(identity.issuer),subject:uuid(identity.subject),email},...(previous?{previousSignIn:{subject:uuid(previous.subject),state:previous.state as PreviousSignIn['state']}}:{}),
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
      if(invitation.status!=='pending'||Date.parse(String(invitation.expires_at))<=Date.now()||invitation.inviter_status!=='active'||!['owner','admin'].includes(invitation.inviter_role))continue
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
  try {
    return await inTransaction(client,async()=>{
    const {identity}=request
    // One account per verified email: link or release it before anything reads by email.
    const claim=(await client.query('SELECT account_id AS "accountId",conflicting_subject AS "conflictingSubject",merge_blocked AS "mergeBlocked" FROM app.claim_account_email($1,$2,$3,$4,$5)',[identity.issuer,identity.subject,identity.email,request.previousSignIn?.subject??null,request.previousSignIn?.state??null])).rows[0] as {accountId:string|null;conflictingSubject:string|null;mergeBlocked:boolean}
    if(claim.conflictingSubject)return {statusCode:409,error:emailInUse,accountClaim:{previousSubject:claim.conflictingSubject}} satisfies AccountClaim
    if(claim.mergeBlocked)throw new ApiError(409,emailInUse)
    if(!claim.accountId)throw new ApiError(404,'Sign in and register the account before accepting invitations')
    const user=(await client.query('SELECT id,display_name AS "displayName" FROM app.users WHERE id=$1',[claim.accountId])).rows[0]
    const result=['list','accept'].includes(request.action)?await invitationTask(client,request,user)
      :await onboardingTask(client,request,user,async()=>((await invitationTask(client,{...request,action:'list'},user)) as {items:unknown[]}).items)
    return result
    })
  } catch(error){if(error instanceof ApiError)return {statusCode:error.status,error:error.message};throw error}
}
