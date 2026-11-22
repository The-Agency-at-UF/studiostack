import type {DatabaseClient} from '../database/client'
import {ApiError,object,text,uuid} from '../database/api-validation'
import {pageOf,requestHash} from '../database/repository-utils'
import {version} from './validation'
import type {ProductionContext,ProductionRequest} from './repository'
import {ideaStatuses} from '../../src/types/production'
const columns=`i.id,i.author_id AS "authorId",coalesce(u.display_name,'Team member') AS "authorName",i.client_account_id AS "clientAccountId",i.title,i.pitch,i.status,i.version,i.created_at AS "createdAt",i.updated_at AS "updatedAt"`
export async function dispatchIdeas(client:DatabaseClient,r:ProductionRequest,context:ProductionContext,reviewer:boolean){
 const org=context.organizationId,user=context.user.id
 const get=async(id:string)=>(await client.query(`SELECT ${columns} FROM app.production_ideas i JOIN app.users u ON u.id=i.author_id WHERE i.organization_id=$1 AND i.id=$2`,[org,id])).rows[0]
 if(r.method==='GET'){const rows=(await client.query(`SELECT ${columns} FROM app.production_ideas i JOIN app.users u ON u.id=i.author_id WHERE i.organization_id=$1 AND ($2::uuid IS NULL OR i.id>$2) ORDER BY i.id LIMIT $3`,[org,r.page.after,r.page.limit+1])).rows;return pageOf(rows,r.page.limit)}
 const v=object(r.body,r.method==='POST'?['id','title','pitch','clientAccountId']:['title','pitch','clientAccountId','status','version']),title=text(v.title,160)
 if(typeof v.pitch!=='string'||!v.pitch.trim()||v.pitch.length>6000||[...v.pitch].some(c=>c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c)))throw new ApiError(400,'Describe the creative pitch in up to 6000 characters')
 const pitch=v.pitch.trim(),clientId=v.clientAccountId==null?null:uuid(v.clientAccountId)
 const validateClient=async()=>{
  if(!clientId)return
  const c=await client.query('SELECT id FROM app.client_accounts WHERE organization_id=$1 AND id=$2 AND deleted_at IS NULL FOR SHARE',[org,clientId])
  if(!c.rows.length)throw new ApiError(400,'Choose an active client account')
 }
 if(r.method==='POST'){
  const id=uuid(v.id),hash=requestHash({title,pitch,clientId})
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`idea:${org}:${id}`])
  const old=(await client.query('SELECT author_id,request_hash FROM app.production_ideas WHERE organization_id=$1 AND id=$2',[org,id])).rows[0]
  if(old){if(old.author_id!==user||old.request_hash!==hash)throw new ApiError(409,'Idea ID already used');return get(id)}
  await validateClient()
  await client.query('INSERT INTO app.production_ideas(id,organization_id,author_id,client_account_id,title,pitch,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,org,user,clientId,title,pitch,hash]);return get(id)
 }
 const id=uuid(r.ideaId),old=(await client.query('SELECT author_id,status,version,client_account_id FROM app.production_ideas WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,id])).rows[0]
 if(!old)throw new ApiError(404,'Idea not found')
 if(!reviewer&&(old.author_id!==user||old.status==='selected'||v.status==='selected'))throw new ApiError(403,'Production leadership selects pitches; authors can edit their own unselected ideas')
 if(old.version!==version(v.version))throw new ApiError(409,'Idea changed. Reload before saving')
 if(!Object.hasOwn(ideaStatuses,String(v.status)))throw new ApiError(400,'Choose an idea status')
 if(clientId!==old.client_account_id)await validateClient()
 await client.query('UPDATE app.production_ideas SET title=$3,pitch=$4,client_account_id=$5,status=$6,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2',[org,id,title,pitch,clientId,v.status]);return get(id)
}
