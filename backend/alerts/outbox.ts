import {randomUUID} from 'node:crypto'
import type {DatabaseClient} from '../database/client'
import {object,uuid} from '../database/api-validation'
import {reconcileAlerts} from './records'
export interface AlertJob {id:string;organizationId:string;recipientIssuer:string;recipientSubject:string;title:string;message:string;targetPath:string;leaseToken:string}
export type AlertOutboxRequest={action:'claim'}|{action:'authorize';organizationId:string;id:string;leaseToken:string}|{action:'ack';organizationId:string;id:string;leaseToken:string;outcome:'sent'|'retry'|'failed'|'uncertain'|'skipped'}
export function alertOutboxRequest(input:unknown):AlertOutboxRequest{const v=object(input,['action','organizationId','id','leaseToken','outcome']);if(v.action==='claim'){object(input,['action']);return {action:'claim'}}if(!['authorize','ack'].includes(String(v.action)))throw new Error('Invalid alert outbox request');const base={organizationId:uuid(v.organizationId),id:uuid(v.id),leaseToken:uuid(v.leaseToken)};if(v.action==='authorize'){object(input,['action','organizationId','id','leaseToken']);return {action:'authorize',...base}}if(!['sent','retry','failed','uncertain','skipped'].includes(String(v.outcome)))throw new Error('Invalid alert outcome');return {action:'ack',...base,outcome:v.outcome as 'sent'|'retry'|'failed'|'uncertain'|'skipped'}}
export async function alertOutboxTask(client:DatabaseClient,r:AlertOutboxRequest):Promise<{jobs?:AlertJob[];allowed?:boolean;updated?:boolean}>{
 await client.query('BEGIN')
 try{
  if(r.action!=='claim'){
   await client.query("SELECT set_config('app.organization_id',$1,true)",[r.organizationId])
   if(r.action==='authorize'){const value=await client.query(`SELECT a.id FROM app.user_alerts a JOIN app.alert_preferences p ON p.organization_id=a.organization_id AND p.user_id=a.recipient_id JOIN app.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.recipient_id WHERE a.organization_id=$1 AND a.id=$2 AND a.lease_token=$3 AND a.email_status='sending' AND a.lease_until>now() AND p.equipment_email AND m.status='active'`,[r.organizationId,r.id,r.leaseToken]);await client.query('COMMIT');return {allowed:value.rows.length===1}}
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['mail-feedback:'+r.id])
      const outcome=(await client.query('SELECT 1 FROM app.email_feedback_events WHERE delivery_id=$1 LIMIT 1',[r.id])).rows.length?'suppressed':r.outcome
   const value=await client.query(`UPDATE app.user_alerts SET email_status=CASE WHEN $4='retry' THEN CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END ELSE $4 END,next_attempt_at=now()+least(3600,power(2,attempts)*60)*interval '1 second',sent_at=CASE WHEN $4='sent' THEN now() ELSE sent_at END,lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND id=$2 AND lease_token=$3 AND email_status='sending' RETURNING id`,[r.organizationId,r.id,r.leaseToken,outcome]);await client.query('COMMIT');return {updated:value.rows.length===1}
  }
  const organizations=await client.query('SELECT id FROM app.organizations ORDER BY id'),jobs:AlertJob[]=[]
  for(const org of organizations.rows){
   await client.query("SELECT set_config('app.organization_id',$1,true)",[org.id]);await reconcileAlerts(client,org.id)
   await client.query("UPDATE app.user_alerts SET email_status='uncertain',lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND email_status='sending' AND lease_until<now()",[org.id])
   await client.query(`UPDATE app.user_alerts a SET email_status='skipped' WHERE organization_id=$1 AND email_status='pending' AND NOT EXISTS(SELECT 1 FROM app.alert_preferences p JOIN app.organization_memberships m ON m.organization_id=p.organization_id AND m.user_id=p.user_id WHERE p.organization_id=a.organization_id AND p.user_id=a.recipient_id AND p.equipment_email AND m.status='active')`,[org.id])
   if(jobs.length>=5)continue
   const value=await client.query(`SELECT a.id,a.title,a.message,a.target_path AS "targetPath",u.cognito_issuer AS "recipientIssuer",u.cognito_subject AS "recipientSubject" FROM app.user_alerts a JOIN app.users u ON u.id=a.recipient_id WHERE a.organization_id=$1 AND a.email_status='pending' AND a.next_attempt_at<=now() AND a.attempts<5 ORDER BY a.next_attempt_at,a.id LIMIT $2 FOR UPDATE OF a SKIP LOCKED`,[org.id,5-jobs.length])
   for(const row of value.rows){const leaseToken=randomUUID();await client.query("UPDATE app.user_alerts SET email_status='sending',attempts=attempts+1,lease_token=$3,lease_until=now()+interval '5 minutes' WHERE organization_id=$1 AND id=$2",[org.id,row.id,leaseToken]);jobs.push({...row,organizationId:org.id,leaseToken} as AlertJob)}
  }
  await client.query('COMMIT');return {jobs}
 }catch(e){await client.query('ROLLBACK').catch(()=>undefined);throw e}
}
