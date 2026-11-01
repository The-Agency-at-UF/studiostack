import {createHash,randomUUID} from 'node:crypto'
import type {DatabaseClient} from '../database/client'
import {ApiError} from '../database/api-validation'
import {emailDomains,joinCodeHash,normalizeJoinCode} from './join-codes'
import type {DirectoryRequest} from './directory'
const codeAttemptsPerHour=10
const requestColumns='r.id,r.organization_id AS "organizationId",o.name AS "organizationName",r.status,r.created_at AS "createdAt",r.decided_at AS "decidedAt"'
async function organizations(client:DatabaseClient,id?:string){return (await client.query('SELECT id,name FROM app.organizations WHERE ($1::uuid IS NULL OR id=$1) ORDER BY id',[id??null])).rows as {id:string;name:string}[]}
const scope=(client:DatabaseClient,org:string)=>client.query("SELECT set_config('app.organization_id',$1,true)",[org])
const lock=(client:DatabaseClient,org:string)=>client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`organization-admin:${org}`])
async function membership(client:DatabaseClient,org:string,user:string){return (await client.query('SELECT role,status FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2',[org,user])).rows[0] as {role:string;status:string}|undefined}
/** Adds an active member once; an existing active membership is kept as-is and a suspended one is never restored. */
async function join(client:DatabaseClient,org:string,user:string,kind:string,details:Record<string,unknown>) {
  const existing=await membership(client,org,user)
  if(existing?.status==='active')return false
  if(existing)throw new ApiError(409,'Ask an administrator to restore the existing membership')
  await client.query("INSERT INTO app.organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'member','active')",[org,user])
  const id=randomUUID(),hash=createHash('sha256').update(`${kind}:${org}:${user}`).digest('hex')
  await client.query('INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details,request_id,request_hash) VALUES($1,$2,$3,$2,$4,$5,$6)',[org,user,kind,details,id,hash])
  return true
}
async function domainMatch(client:DatabaseClient,org:string,email:string){return (await client.query('SELECT domain,auto_join AS "autoJoin" FROM app.organization_domains WHERE organization_id=$1 AND domain=ANY($2::text[]) ORDER BY length(domain) DESC LIMIT 1',[org,emailDomains(email)])).rows[0] as {domain:string;autoJoin:boolean}|undefined}

/** Runs inside the directory transaction for a registered user with a verified email. */
export async function onboardingTask(client:DatabaseClient,request:DirectoryRequest,user:{id:string;displayName:string|null},invitations:()=>Promise<unknown[]>) {
  const {identity}=request
  if(request.action==='overview') {
    const domainMatches=[],requests=[]
    for(const org of await organizations(client)) {
      await scope(client,org.id)
      const member=await membership(client,org.id,user.id),match=await domainMatch(client,org.id,identity.email)
      if(match&&!member)domainMatches.push({organizationId:org.id,organizationName:org.name,autoJoin:match.autoJoin})
      requests.push(...(await client.query(`SELECT ${requestColumns} FROM app.organization_access_requests r JOIN app.organizations o ON o.id=r.organization_id WHERE r.organization_id=$1 AND r.user_id=$2 AND (r.status='pending' OR (r.status='denied' AND r.decided_at>now()-interval '30 days')) ORDER BY r.created_at DESC`,[org.id,user.id])).rows)
    }
    return {email:identity.email,displayName:user.displayName,invitations:await invitations(),domainMatches,requests}
  }
  if(request.action==='join-domain') {
    const [org]=await organizations(client,request.organizationId)
    if(!org)throw new ApiError(404,'No workspace matches your verified email')
    await scope(client,org.id);await lock(client,org.id)
    const match=await domainMatch(client,org.id,identity.email)
    if(!match?.autoJoin)throw new ApiError(404,'No workspace matches your verified email')
    await join(client,org.id,user.id,'member_joined_domain',{domain:match.domain})
    return {organizationId:org.id}
  }
  if(request.action==='join-code') {
    const recent=Number((await client.query("SELECT count(*) FROM app.join_code_attempts WHERE user_id=$1 AND attempted_at>now()-interval '1 hour'",[user.id])).rows[0].count)
    if(recent>=codeAttemptsPerHour)return {statusCode:429,error:'Too many join code attempts. Try again in an hour.'}
    const code=normalizeJoinCode(request.code!),hash=code&&joinCodeHash(code)
    for(const org of hash?await organizations(client):[]) {
      await scope(client,org.id)
      if(!(await client.query('SELECT 1 FROM app.organization_join_codes WHERE organization_id=$1 AND code_hash=$2',[org.id,hash])).rows.length)continue
      await lock(client,org.id)
      const found=(await client.query('SELECT id,label,uses,max_uses AS "maxUses" FROM app.organization_join_codes WHERE organization_id=$1 AND code_hash=$2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) FOR UPDATE',[org.id,hash])).rows[0]
      if(!found)break
      if((await membership(client,org.id,user.id))?.status==='active')return {organizationId:org.id}
      if(found.maxUses!==null&&found.uses>=found.maxUses)break
      await join(client,org.id,user.id,'member_joined_code',{codeId:found.id,label:found.label})
      await client.query('UPDATE app.organization_join_codes SET uses=uses+1,version=version+1 WHERE organization_id=$1 AND id=$2',[org.id,found.id])
      return {organizationId:org.id}
    }
    // Same answer for unknown, revoked, expired and used-up codes; the attempt still commits.
    await client.query('INSERT INTO app.join_code_attempts(user_id) VALUES($1)',[user.id])
    return {statusCode:404,error:'That join code is not valid. Check it with your workspace administrator.'}
  }
  if(request.action==='request-access') {
    const [org]=await organizations(client,request.organizationId)
    if(!org)throw new ApiError(404,'No workspace matches your verified email')
    await scope(client,org.id);await lock(client,org.id)
    const match=await domainMatch(client,org.id,identity.email)
    if(!match)throw new ApiError(404,'No workspace matches your verified email')
    if(match.autoJoin)throw new ApiError(409,'Join this workspace directly')
    if(await membership(client,org.id,user.id))throw new ApiError(409,'You already have a membership in this workspace')
    const existing=(await client.query(`SELECT ${requestColumns} FROM app.organization_access_requests r JOIN app.organizations o ON o.id=r.organization_id WHERE r.organization_id=$1 AND r.user_id=$2 AND r.status='pending'`,[org.id,user.id])).rows[0]
    if(existing)return existing
    const id=(await client.query('INSERT INTO app.organization_access_requests(organization_id,user_id,message) VALUES($1,$2,$3) RETURNING id',[org.id,user.id,request.message??null])).rows[0].id
    return (await client.query(`SELECT ${requestColumns} FROM app.organization_access_requests r JOIN app.organizations o ON o.id=r.organization_id WHERE r.organization_id=$1 AND r.id=$2`,[org.id,id])).rows[0]
  }
  if(request.action==='withdraw-request') {
    await scope(client,request.organizationId!)
    const row=(await client.query("UPDATE app.organization_access_requests SET status='withdrawn',version=version+1 WHERE organization_id=$1 AND id=$2 AND user_id=$3 AND status='pending' RETURNING id",[request.organizationId,request.requestId,user.id])).rows[0]
    if(!row)throw new ApiError(404,'Access request not found')
    return {id:row.id,status:'withdrawn'}
  }
  throw new ApiError(400,'Invalid directory operation')
}
