import {inTransaction,type DatabaseClient} from '../database/client'
import {acknowledgeLease,claimLeases,setOrganization,type LeasedOutbox} from '../database/leased-outbox'
import {object,uuid} from '../database/api-validation'
import {reconcileAlerts} from './records'
export interface AlertJob {id:string;organizationId:string;recipientIssuer:string;recipientSubject:string;title:string;message:string;targetPath:string;leaseToken:string}
export type AlertOutboxRequest={action:'claim'}|{action:'authorize';organizationId:string;id:string;leaseToken:string}|{action:'ack';organizationId:string;id:string;leaseToken:string;outcome:'sent'|'retry'|'failed'|'uncertain'|'skipped'}
export function alertOutboxRequest(input:unknown):AlertOutboxRequest{const v=object(input,['action','organizationId','id','leaseToken','outcome']);if(v.action==='claim'){object(input,['action']);return {action:'claim'}}if(!['authorize','ack'].includes(String(v.action)))throw new Error('Invalid alert outbox request');const base={organizationId:uuid(v.organizationId),id:uuid(v.id),leaseToken:uuid(v.leaseToken)};if(v.action==='authorize'){object(input,['action','organizationId','id','leaseToken']);return {action:'authorize',...base}}if(!['sent','retry','failed','uncertain','skipped'].includes(String(v.outcome)))throw new Error('Invalid alert outcome');return {action:'ack',...base,outcome:v.outcome as 'sent'|'retry'|'failed'|'uncertain'|'skipped'}}
const alertOutbox:LeasedOutbox={table:'user_alerts',status:'email_status',pending:'pending',deliveredAt:'sent_at',feedbackColumn:'delivery_id',suppressedOutcome:'suppressed'}
export async function alertOutboxTask(client:DatabaseClient,r:AlertOutboxRequest):Promise<{jobs?:AlertJob[];allowed?:boolean;updated?:boolean}>{
 return inTransaction(client,async()=>{
  if(r.action==='authorize'){await setOrganization(client,r.organizationId);const value=await client.query(`SELECT a.id FROM app.user_alerts a JOIN app.alert_preferences p ON p.organization_id=a.organization_id AND p.user_id=a.recipient_id JOIN app.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.recipient_id WHERE a.organization_id=$1 AND a.id=$2 AND a.lease_token=$3 AND a.email_status='sending' AND a.lease_until>now() AND p.equipment_email AND m.status='active'`,[r.organizationId,r.id,r.leaseToken]);return {allowed:value.rows.length===1}}
  if(r.action==='ack')return acknowledgeLease(client,alertOutbox,r)
  return {jobs:await claimLeases<{id:string},AlertJob>(client,alertOutbox,{
   organizations:'SELECT id FROM app.organizations ORDER BY id',
   prepare:org=>reconcileAlerts(client,org.id),
   cleanup:org=>client.query(`UPDATE app.user_alerts a SET email_status='skipped' WHERE organization_id=$1 AND email_status='pending' AND NOT EXISTS(SELECT 1 FROM app.alert_preferences p JOIN app.organization_memberships m ON m.organization_id=p.organization_id AND m.user_id=p.user_id WHERE p.organization_id=a.organization_id AND p.user_id=a.recipient_id AND p.equipment_email AND m.status='active')`,[org.id]),
   select:`SELECT a.id,a.title,a.message,a.target_path AS "targetPath",u.cognito_issuer AS "recipientIssuer",u.cognito_subject AS "recipientSubject" FROM app.user_alerts a JOIN app.users u ON u.id=a.recipient_id WHERE a.organization_id=$1 AND a.email_status='pending' AND a.next_attempt_at<=now() AND a.attempts<5 ORDER BY a.next_attempt_at,a.id LIMIT $2 FOR UPDATE OF a SKIP LOCKED`,
   job:(row,org,leaseToken)=>({...row,organizationId:org.id,leaseToken}) as AlertJob,
  })}
 })
}
