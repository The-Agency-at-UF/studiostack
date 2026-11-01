import {dispatchInvitations} from './invitations'
import {dispatchJoinMethods} from './join-methods'
import type {DatabaseClient} from '../database/client'
import {ApiError} from '../database/api-validation'
import {changeMember,changeOrganization} from './validation'
import type {AccountRequest} from './routes'
import type {ApiOrganization} from '../../src/types/database-api'
import {isAdmin,pageOf,requestHash} from '../database/repository-utils'
type Context={organizationId:string;user:{id:string};membership:{role:ApiOrganization['role']}}
const memberColumns='u.id,u.email,u.display_name AS "displayName",m.role,m.status,m.version'
const forbidden=():never=>{throw new ApiError(403,'Organization owner or administrator access required')}
const conflict=():never=>{throw new ApiError(409,'The record changed. Reload before saving.')}
export async function dispatchAccounts(client:DatabaseClient,request:AccountRequest,context:Context) {
  const {organizationId,user}=context,{resource,method,page}=request
  let role=context.membership.role
  async function settings(){return (await client.query('SELECT id,name,slug,reservation_days AS "reservationDays",version FROM app.organizations WHERE id=$1',[organizationId])).rows[0]}
  async function member(id:string){const row=(await client.query(`SELECT ${memberColumns} FROM app.organization_memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2`,[organizationId,id])).rows[0];if(!row)throw new ApiError(404,'Member not found');return row}
  if(method!=='GET') {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`organization-admin:${organizationId}`])
    const actor=(await client.query("SELECT role FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='active'",[organizationId,user.id])).rows[0]
    if(!actor)forbidden();role=actor.role
  }
  if(resource==='settings'&&method==='GET')return {...await settings(),role}
  if(resource==='directory'&&method==='GET'){
    // Any active member may see who else is active, by name and role only. Emails and statuses stay admin-only.
    const {rows}=await client.query(`SELECT u.id,COALESCE(u.display_name,'Team member') AS "displayName",m.role FROM app.organization_memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.status='active' AND ($2::uuid IS NULL OR u.id>$2) ORDER BY u.id LIMIT $3`,[organizationId,page.after,page.limit+1])
    return pageOf(rows,page.limit)
  }
  if(!isAdmin(role))forbidden()
  if(resource==='invitations')return dispatchInvitations(client,request,{id:user.id,role})
  if(['domains','join-codes','access-requests'].includes(resource))return dispatchJoinMethods(client,request,{id:user.id,role})
  if(method==='GET') {
    const queries:Record<string,string>={
      members:`SELECT ${memberColumns} FROM app.organization_memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND ($2::uuid IS NULL OR u.id>$2) ORDER BY u.id LIMIT $3`,
      activity:`SELECT e.id,COALESCE(u.display_name,'Team member') AS "actorName",e.kind,e.target_id AS "targetId",e.details,e.created_at AS "createdAt" FROM app.organization_audit_events e JOIN app.users u ON u.id=e.actor_id WHERE e.organization_id=$1 AND ($2::uuid IS NULL OR e.id>$2) ORDER BY e.id LIMIT $3`,
    }
    if(!queries[resource])throw new ApiError(404,'Administration resource not found')
    const {rows}=await client.query(queries[resource],[organizationId,page.after,page.limit+1])
    return pageOf(rows,page.limit)
  }
  if(resource!=='members'&&resource!=='settings')throw new ApiError(404,'Administration resource not found')
  const input=resource==='members'?changeMember(request.body):changeOrganization(request.body)
  const fingerprint=requestHash({resource,method,memberId:request.memberId,input})
  const previous=(await client.query('SELECT request_hash,target_id FROM app.organization_audit_events WHERE organization_id=$1 AND actor_id=$2 AND request_id=$3',[organizationId,user.id,input.requestId])).rows[0]
  if(previous){if(previous.request_hash!==fingerprint)conflict();return resource==='settings'?{...await settings(),role}:member(previous.target_id)}
  let targetId=organizationId,kind='',details:Record<string,unknown>={}
  if(resource==='settings') {
    const v=changeOrganization(request.body),current=await settings();if(current.version!==v.version)conflict()
    await client.query('UPDATE app.organizations SET name=$2,reservation_days=$3,version=version+1 WHERE id=$1',[organizationId,v.name,v.reservationDays]);kind='organization_updated';details={name:v.name,reservationDays:v.reservationDays}
  } else if(resource==='members') {
    const v=changeMember(request.body),current=await member(request.memberId!);targetId=current.id
    if(current.version!==v.version)conflict()
    if(current.status==='invited')throw new ApiError(409,'An invited person must accept their invitation first')
    if(role!=='owner'&&(current.role!=='member'||v.role!=='member'))forbidden()
    if(current.role==='owner'&&current.status==='active'&&(v.role!=='owner'||v.status!=='active')) {
      const owners=await client.query("SELECT user_id FROM app.organization_memberships WHERE organization_id=$1 AND role='owner' AND status='active'",[organizationId])
      if(owners.rows.length<2)throw new ApiError(409,'Keep at least one active organization owner')
    }
    await client.query('UPDATE app.organization_memberships SET role=$3,status=$4,version=version+1 WHERE organization_id=$1 AND user_id=$2',[organizationId,current.id,v.role,v.status]);kind='member_updated';details={fromRole:current.role,role:v.role,fromStatus:current.status,status:v.status}
  }
  await client.query('INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[organizationId,user.id,kind,targetId,details,input.requestId,fingerprint])
  return resource==='settings'?{...await settings(),role}:member(targetId)
}
