import type {DatabaseClient} from '../database/client'
import {ApiError,object,uuid,text} from '../database/api-validation'
import {version} from './validation'
import type {ProductionRequest} from './repository'
import {pageOf} from '../database/repository-utils'
export async function dispatchClients(client:DatabaseClient,r:ProductionRequest,canManage:boolean){
 const columns='id,name,version,archived_at AS "archivedAt"',org=r.organizationId
 if(r.method==='GET'){
  const rows=(await client.query('SELECT '+columns+' FROM app.client_accounts WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',[org,r.page.after,r.page.limit+1])).rows
  return pageOf(rows,r.page.limit)
 }
 if(!canManage)throw new ApiError(403,'Production leadership or an administrator manages client accounts')
 if(r.method==='POST'){
  const v=object(r.body,['name']),name=text(v.name,160)
  await client.query('INSERT INTO app.client_accounts(organization_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',[org,name])
  return (await client.query('SELECT '+columns+' FROM app.client_accounts WHERE organization_id=$1 AND lower(btrim(name))=lower($2)',[org,name])).rows[0]
 }
 const v=object(r.body,['name','archived','version']),name=text(v.name,160),expected=version(v.version)
 if(typeof v.archived!=='boolean')throw new ApiError(400,'Invalid client account status')
 const row=(await client.query('SELECT version FROM app.client_accounts WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,uuid(r.clientId)])).rows[0]
 if(!row)throw new ApiError(404,'Client account not found');if(row.version!==expected)throw new ApiError(409,'Client account changed. Reload before saving')
 const duplicate=await client.query('SELECT id FROM app.client_accounts WHERE organization_id=$1 AND lower(btrim(name))=lower($2) AND id<>$3',[org,name,r.clientId]);if(duplicate.rows.length)throw new ApiError(409,'A client account with this name already exists')
 return (await client.query('UPDATE app.client_accounts SET name=$3,archived_at=CASE WHEN $4 THEN coalesce(archived_at,now()) ELSE NULL END,version=version+1 WHERE organization_id=$1 AND id=$2 RETURNING '+columns,[org,r.clientId,name,v.archived])).rows[0]
}
