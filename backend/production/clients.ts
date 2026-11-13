import type {DatabaseClient} from '../database/client'
import {ApiError,object,uuid,text} from '../database/api-validation'
import {version} from './validation'
import type {ProductionRequest} from './repository'
import {pageOf} from '../database/repository-utils'
export interface ClientPermissions {userId:string;canManage:boolean;admin:boolean}
// Owners, administrators and the account's creator may delete or restore it.
// Production leadership may add and rename accounts, but not delete others' accounts.
export const canDeleteClient=(p:ClientPermissions,createdBy:string|null)=>p.admin||createdBy!==null&&createdBy===p.userId
export async function dispatchClients(client:DatabaseClient,r:ProductionRequest,p:ClientPermissions){
 // archivedAt and the archived flag stay as aliases for web builds from before deletion.
 const columns='id,name,version,created_by AS "createdBy",deleted_at AS "deletedAt",deleted_at AS "archivedAt"',org=r.organizationId
 if(r.method==='GET'){
  const rows=(await client.query('SELECT '+columns+' FROM app.client_accounts WHERE organization_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',[org,r.page.after,r.page.limit+1])).rows
  return pageOf(rows,r.page.limit)
 }
 if(r.method==='POST'){
  if(!p.canManage)throw new ApiError(403,'Production leadership or an administrator adds client accounts')
  const v=object(r.body,['name']),name=text(v.name,160)
  await client.query('INSERT INTO app.client_accounts(organization_id,name,created_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[org,name,p.userId])
  const row=(await client.query('SELECT '+columns+' FROM app.client_accounts WHERE organization_id=$1 AND lower(btrim(name))=lower($2)',[org,name])).rows[0]
  if(row.deletedAt)throw new ApiError(409,'A deleted client account has this name. Restore it instead')
  return row
 }
 const v=object(r.body,['name','deleted','archived','version']),name=text(v.name,160),expected=version(v.version),deleted=v.deleted??v.archived
 if(typeof deleted!=='boolean'||v.deleted!==undefined&&v.archived!==undefined)throw new ApiError(400,'Invalid client account status')
 const row=(await client.query('SELECT name,version,created_by AS "createdBy",deleted_at AS "deletedAt" FROM app.client_accounts WHERE organization_id=$1 AND id=$2 FOR UPDATE',[org,uuid(r.clientId)])).rows[0]
 if(!row)throw new ApiError(404,'Client account not found')
 const changesStatus=deleted!==Boolean(row.deletedAt)
 if(changesStatus&&!canDeleteClient(p,row.createdBy))throw new ApiError(403,'Only owners, administrators or the person who added this client account can delete or restore it')
 if(!changesStatus&&!p.canManage)throw new ApiError(403,'Production leadership or an administrator renames client accounts')
 if(row.version!==expected)throw new ApiError(409,'Client account changed. Reload before saving')
 if(row.deletedAt&&deleted&&name!==row.name)throw new ApiError(409,'Restore this client account before renaming it')
 const duplicate=await client.query('SELECT id FROM app.client_accounts WHERE organization_id=$1 AND lower(btrim(name))=lower($2) AND id<>$3',[org,name,r.clientId]);if(duplicate.rows.length)throw new ApiError(409,'A client account with this name already exists')
 return (await client.query('UPDATE app.client_accounts SET name=$3,deleted_at=CASE WHEN $4 THEN coalesce(deleted_at,now()) ELSE NULL END,deleted_by=CASE WHEN $4 THEN coalesce(deleted_by,$5) ELSE NULL END,version=version+1 WHERE organization_id=$1 AND id=$2 RETURNING '+columns,[org,r.clientId,name,deleted,p.userId])).rows[0]
}
