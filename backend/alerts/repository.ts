import type {DatabaseClient} from '../database/client'
import {ApiError,object} from '../database/api-validation'
import {reconcileAlerts} from './records'
import type {AlertRequest} from './routes'
const columns='id,kind,title,message,target_path AS "targetPath",created_at AS "createdAt",read_at AS "readAt",email_status AS "emailStatus"'
export async function dispatchAlerts(client:DatabaseClient,r:AlertRequest,{organizationId:org,user}:{organizationId:string;user:{id:string}}){
 if(r.resource==='preferences'){
  if(r.method==='PATCH'){const v=object(r.body,['equipmentEmail','version']);if(typeof v.equipmentEmail!=='boolean'||!Number.isInteger(v.version)||Number(v.version)<0)throw new ApiError(400,'Invalid notification preferences')
   const result=await client.query(`INSERT INTO app.alert_preferences(organization_id,user_id,equipment_email) SELECT $1,$2,$3 WHERE $4=0 ON CONFLICT(organization_id,user_id) DO NOTHING RETURNING version`,[org,user.id,v.equipmentEmail,v.version])
   if(!result.rows.length){const updated=await client.query('UPDATE app.alert_preferences SET equipment_email=$3,version=version+1 WHERE organization_id=$1 AND user_id=$2 AND version=$4 RETURNING version',[org,user.id,v.equipmentEmail,v.version]);if(!updated.rows.length)throw new ApiError(409,'Notification preferences changed. Refresh before saving')}
   if(!v.equipmentEmail)await client.query("UPDATE app.user_alerts SET email_status='skipped' WHERE organization_id=$1 AND recipient_id=$2 AND email_status='pending'",[org,user.id])
  }
  return (await client.query('SELECT equipment_email AS "equipmentEmail",version FROM app.alert_preferences WHERE organization_id=$1 AND user_id=$2',[org,user.id])).rows[0]??{equipmentEmail:false,version:0}
 }
 if(r.resource==='read'){object(r.body,[]);const value=await client.query('UPDATE app.user_alerts SET read_at=coalesce(read_at,now()) WHERE organization_id=$1 AND recipient_id=$2 AND id=$3 RETURNING '+columns,[org,user.id,r.alertId]);if(!value.rows.length)throw new ApiError(404,'Alert not found');return value.rows[0]}
 await reconcileAlerts(client,org)
 const result=await client.query('SELECT '+columns+' FROM app.user_alerts WHERE organization_id=$1 AND recipient_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4',[org,user.id,r.page.after,r.page.limit+1]),items=result.rows.slice(0,r.page.limit)
 return {items,nextCursor:result.rows.length>r.page.limit?items.at(-1)!.id:null}
}
