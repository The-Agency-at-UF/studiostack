import {createHash,randomInt} from 'node:crypto'
import type {DatabaseClient} from '../database/client'
import {ApiError,object,text,uuid} from '../database/api-validation'
import {versioned} from './validation'
import {emailDomains,joinCodeAlphabet,joinCodeHash,joinCodeLength} from './join-codes'
import type {AccountRequest} from './routes'
/** Free-mail providers can never identify an organization. */
export const publicEmailDomains=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','mac.com','yahoo.com','ymail.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net','mail.com','zoho.com','yandex.com','hey.com','fastmail.com','tutanota.com','qq.com','163.com','edu.com'])
const domainColumns='domain,auto_join AS "autoJoin",version,created_at AS "createdAt"'
const codeColumns='id,label,max_uses AS "maxUses",uses,expires_at AS "expiresAt",revoked_at AS "revokedAt",version,created_at AS "createdAt"'
const requestColumns='r.id,r.user_id AS "userId",u.email,u.display_name AS "displayName",r.message,r.status,r.version,r.created_at AS "createdAt",r.decided_at AS "decidedAt"'
export function addDomain(input:unknown) {
  const v=object(input,['domain','autoJoin','requestId']),domain=text(v.domain,253).toLowerCase().replace(/^@/,'')
  if(typeof v.autoJoin!=='boolean'||!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain))throw new ApiError(400,'Enter a domain such as studio.example.edu')
  return {domain,autoJoin:v.autoJoin,requestId:uuid(v.requestId)}
}
export function createJoinCode(input:unknown) {
  const v=object(input,['label','maxUses','expiresInDays','requestId'])
  if(v.maxUses!==undefined&&v.maxUses!==null&&(!Number.isInteger(v.maxUses)||Number(v.maxUses)<1||Number(v.maxUses)>10000))throw new ApiError(400,'Uses must be between 1 and 10000')
  if(v.expiresInDays!==undefined&&v.expiresInDays!==null&&(!Number.isInteger(v.expiresInDays)||Number(v.expiresInDays)<1||Number(v.expiresInDays)>365))throw new ApiError(400,'Expiry must be between 1 and 365 days')
  return {label:text(v.label,80),maxUses:(v.maxUses??null) as number|null,expiresInDays:(v.expiresInDays??null) as number|null,requestId:uuid(v.requestId)}
}
const newCode=()=>Array.from({length:joinCodeLength},()=>joinCodeAlphabet[randomInt(joinCodeAlphabet.length)]).join('')
export async function dispatchJoinMethods(client:DatabaseClient,request:AccountRequest,actor:{id:string;role:string}) {
  const org=request.organizationId,{resource,method,page}=request
  const domain=async(name:string)=>{const v=(await client.query(`SELECT ${domainColumns} FROM app.organization_domains WHERE organization_id=$1 AND domain=$2`,[org,name])).rows[0];if(!v)throw new ApiError(404,'Domain not found');return v}
  const code=async(id:string)=>{const v=(await client.query(`SELECT ${codeColumns} FROM app.organization_join_codes WHERE organization_id=$1 AND id=$2`,[org,id])).rows[0];if(!v)throw new ApiError(404,'Join code not found');return v}
  const accessRequest=async(id:string)=>{const v=(await client.query(`SELECT ${requestColumns} FROM app.organization_access_requests r JOIN app.users u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.id=$2`,[org,id])).rows[0];if(!v)throw new ApiError(404,'Access request not found');return v}
  if(resource==='domains'&&actor.role!=='owner')throw new ApiError(403,'Only an owner can manage workspace domains')
  if(method==='GET') {
    // A workspace has a handful of domains; list them whole.
    if(resource==='domains')return {items:(await client.query(`SELECT ${domainColumns} FROM app.organization_domains WHERE organization_id=$1 ORDER BY domain LIMIT 100`,[org])).rows,nextCursor:null}
    const queries:Record<string,string>={
      'join-codes':`SELECT ${codeColumns} FROM app.organization_join_codes WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
      'access-requests':`SELECT ${requestColumns} FROM app.organization_access_requests r JOIN app.users u ON u.id=r.user_id WHERE r.organization_id=$1 AND r.status='pending' AND ($2::uuid IS NULL OR r.id>$2) ORDER BY r.id LIMIT $3`,
    }
    const {rows}=await client.query(queries[resource],[org,page.after,page.limit+1]),items=rows.slice(0,page.limit)
    return {items,nextCursor:rows.length>page.limit?items.at(-1)!.id:null}
  }
  const input=resource==='domains'&&!request.domain?addDomain(request.body):resource==='join-codes'&&!request.codeId?createJoinCode(request.body):resource==='domains'&&request.action==='update'?(v=>({...versioned(v),autoJoin:v.autoJoin}))(object(request.body,['autoJoin','version','requestId'])):versioned(object(request.body,['version','requestId']))
  const hash=createHash('sha256').update(JSON.stringify({resource,input,domain:request.domain,codeId:request.codeId,accessRequestId:request.accessRequestId,action:request.action})).digest('hex')
  const previous=(await client.query('SELECT target_id,details,request_hash FROM app.organization_audit_events WHERE organization_id=$1 AND actor_id=$2 AND request_id=$3',[org,actor.id,input.requestId])).rows[0]
  if(previous) {
    if(previous.request_hash!==hash)throw new ApiError(409,'Request ID already used for another action')
    if(resource==='domains')return request.action==='remove'?{domain:previous.details.domain,removed:true}:domain(previous.details.domain)
    return resource==='join-codes'?code(previous.target_id):accessRequest(previous.target_id)
  }
  let kind='',targetId:string|null=null,details:Record<string,unknown>={},result:unknown
  if(resource==='domains') {
    if(!request.domain) {
      const v=input as ReturnType<typeof addDomain>
      if(publicEmailDomains.has(v.domain))throw new ApiError(400,'Public email providers cannot identify a workspace')
      const email=(await client.query('SELECT email FROM app.users WHERE id=$1',[actor.id])).rows[0]?.email
      if(!email||!emailDomains(email).includes(v.domain))throw new ApiError(403,'Add a domain that your own verified email belongs to')
      const taken=await client.query('INSERT INTO app.organization_domains(domain,organization_id,auto_join,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(domain) DO NOTHING RETURNING domain',[v.domain,org,v.autoJoin,actor.id])
      if(!taken.rows.length)throw new ApiError(409,'That domain already belongs to a workspace')
      kind='domain_added';details={domain:v.domain,autoJoin:v.autoJoin};result=await domain(v.domain)
    } else {
      const current=await domain(request.domain),v=input as {version:number;autoJoin?:unknown}
      if(current.version!==v.version)throw new ApiError(409,'The record changed. Reload before saving.')
      if(request.action==='remove'){await client.query('DELETE FROM app.organization_domains WHERE organization_id=$1 AND domain=$2',[org,current.domain]);kind='domain_removed';details={domain:current.domain};result={domain:current.domain,removed:true}}
      else {
        if(typeof v.autoJoin!=='boolean')throw new ApiError(400,'Choose whether matching accounts join automatically')
        await client.query('UPDATE app.organization_domains SET auto_join=$3,version=version+1 WHERE organization_id=$1 AND domain=$2',[org,current.domain,v.autoJoin]);kind='domain_updated';details={domain:current.domain,autoJoin:v.autoJoin};result=await domain(current.domain)
      }
    }
  } else if(resource==='join-codes') {
    if(!request.codeId) {
      const v=input as ReturnType<typeof createJoinCode>,plain=newCode()
      targetId=(await client.query("INSERT INTO app.organization_join_codes(organization_id,code_hash,label,max_uses,expires_at,created_by) VALUES($1,$2,$3,$4,CASE WHEN $5::int IS NULL THEN NULL ELSE now()+make_interval(days=>$5::int) END,$6) RETURNING id",[org,joinCodeHash(plain),v.label,v.maxUses,v.expiresInDays,actor.id])).rows[0].id
      kind='join_code_created';details={label:v.label,maxUses:v.maxUses,expiresInDays:v.expiresInDays}
      // The plain code is returned once here and never stored.
      result={...await code(targetId!),code:`${plain.slice(0,5)}-${plain.slice(5)}`}
    } else {
      const current=await code(request.codeId),v=input as {version:number}
      if(current.version!==v.version||current.revokedAt)throw new ApiError(409,'Join code changed or is already revoked')
      await client.query('UPDATE app.organization_join_codes SET revoked_at=now(),version=version+1 WHERE organization_id=$1 AND id=$2',[org,current.id]);targetId=current.id;kind='join_code_revoked';details={label:current.label};result=await code(current.id)
    }
  } else {
    const current=await accessRequest(request.accessRequestId!),v=input as {version:number}
    if(current.version!==v.version||current.status!=='pending')throw new ApiError(409,'The request changed or was already decided')
    if(request.action==='approve') {
      const existing=(await client.query('SELECT status FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2',[org,current.userId])).rows[0]
      if(existing&&existing.status!=='active')throw new ApiError(409,'Restore the existing membership from Members instead')
      if(!existing)await client.query("INSERT INTO app.organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'member','active')",[org,current.userId])
    } else if(request.action!=='deny')throw new ApiError(404,'Access request action not found')
    await client.query('UPDATE app.organization_access_requests SET status=$3,decided_by=$4,decided_at=now(),version=version+1 WHERE organization_id=$1 AND id=$2',[org,current.id,request.action==='approve'?'approved':'denied',actor.id])
    targetId=current.id;kind=request.action==='approve'?'access_request_approved':'access_request_denied';details={userId:current.userId,email:current.email};result=await accessRequest(current.id)
  }
  await client.query('INSERT INTO app.organization_audit_events(organization_id,actor_id,kind,target_id,details,request_id,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[org,actor.id,kind,targetId,details,input.requestId,hash])
  return result
}
