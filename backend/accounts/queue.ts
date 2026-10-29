import {randomUUID} from 'node:crypto'
import type {DatabaseClient} from '../database/client'
import {object,uuid} from '../database/api-validation'
export interface InvitationJob {id:string;organizationId:string;organizationName:string;email:string;displayName:string;role:string;attempts:number;leaseToken:string}
export type InvitationQueueRequest={action:'claim'}|{action:'ack';organizationId:string;id:string;leaseToken:string;outcome:'sent'|'retry'|'failed'|'uncertain'}
export function invitationQueueRequest(input:unknown):InvitationQueueRequest {
  const v=object(input,['action','organizationId','id','leaseToken','outcome'])
  if(v.action==='claim'){object(input,['action']);return {action:'claim'}}
  if(v.action!=='ack'||!['sent','retry','failed','uncertain'].includes(String(v.outcome)))throw new Error('Invalid invitation queue operation')
  return {action:'ack',organizationId:uuid(v.organizationId),id:uuid(v.id),leaseToken:uuid(v.leaseToken),outcome:v.outcome as 'sent'|'retry'|'failed'|'uncertain'}
}
export async function invitationQueueTask(client:DatabaseClient,request:InvitationQueueRequest) {
  await client.query('BEGIN')
  try {
    if(request.action==='ack') {
      await client.query("SELECT set_config('app.organization_id',$1,true)",[request.organizationId])
      const outcome=(await client.query('SELECT 1 FROM app.email_feedback_events WHERE invitation_id=$1 LIMIT 1',[request.id])).rows.length?'failed':request.outcome
      const result=await client.query(`UPDATE app.organization_invitations SET delivery_status=CASE WHEN $4='retry' THEN CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END ELSE $4 END,next_attempt_at=now()+LEAST(3600,power(2,attempts)*60)*interval '1 second',lease_token=NULL,lease_until=NULL,delivered_at=CASE WHEN $4='sent' THEN now() ELSE delivered_at END WHERE organization_id=$1 AND id=$2 AND lease_token=$3 AND delivery_status='sending' RETURNING id`,[request.organizationId,request.id,request.leaseToken,outcome])
      await client.query('COMMIT');return {updated:result.rows.length===1}
    }
    const organizations=(await client.query('SELECT id,name FROM app.organizations ORDER BY id')).rows,jobs:InvitationJob[]=[]
    for(const org of organizations) {
      await client.query("SELECT set_config('app.organization_id',$1,true)",[org.id])
      await client.query("UPDATE app.organization_invitations SET delivery_status='uncertain',lease_token=NULL,lease_until=NULL WHERE organization_id=$1 AND delivery_status='sending' AND lease_until<now()",[org.id])
      await client.query("UPDATE app.organization_invitations i SET delivery_status='failed' WHERE organization_id=$1 AND status='pending' AND delivery_status='queued' AND NOT EXISTS(SELECT 1 FROM app.organization_memberships m WHERE m.organization_id=i.organization_id AND m.user_id=i.created_by AND m.status='active' AND (m.role='owner' OR (m.role='admin' AND i.role='member')))",[org.id])
      if(jobs.length>=5)continue
      const rows=(await client.query(`SELECT id,email,display_name AS "displayName",role,attempts FROM app.organization_invitations WHERE organization_id=$1 AND status='pending' AND delivery_status='queued' AND expires_at>now() AND next_attempt_at<=now() AND attempts<5 ORDER BY next_attempt_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,[org.id,5-jobs.length])).rows
      for(const row of rows){const leaseToken=randomUUID();await client.query("UPDATE app.organization_invitations SET delivery_status='sending',attempts=attempts+1,lease_token=$3,lease_until=now()+interval '5 minutes' WHERE organization_id=$1 AND id=$2",[org.id,row.id,leaseToken]);jobs.push({...row,organizationId:org.id,organizationName:org.name,attempts:row.attempts+1,leaseToken} as InvitationJob)}
    }
    await client.query('COMMIT');return {jobs}
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
}
