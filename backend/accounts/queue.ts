import {inTransaction,type DatabaseClient} from '../database/client'
import {acknowledgeLease,claimLeases,type LeasedOutbox} from '../database/leased-outbox'
import {object,uuid} from '../database/api-validation'
export interface InvitationJob {id:string;organizationId:string;organizationName:string;email:string;displayName:string;role:string;attempts:number;leaseToken:string}
export type InvitationQueueRequest={action:'claim'}|{action:'ack';organizationId:string;id:string;leaseToken:string;outcome:'sent'|'retry'|'failed'|'uncertain'}
export function invitationQueueRequest(input:unknown):InvitationQueueRequest {
  const v=object(input,['action','organizationId','id','leaseToken','outcome'])
  if(v.action==='claim'){object(input,['action']);return {action:'claim'}}
  if(v.action!=='ack'||!['sent','retry','failed','uncertain'].includes(String(v.outcome)))throw new Error('Invalid invitation queue operation')
  return {action:'ack',organizationId:uuid(v.organizationId),id:uuid(v.id),leaseToken:uuid(v.leaseToken),outcome:v.outcome as 'sent'|'retry'|'failed'|'uncertain'}
}
const invitationOutbox:LeasedOutbox={table:'organization_invitations',status:'delivery_status',pending:'queued',deliveredAt:'delivered_at',feedbackColumn:'invitation_id',suppressedOutcome:'failed'}
export async function invitationQueueTask(client:DatabaseClient,request:InvitationQueueRequest) {
  return inTransaction(client,async()=>{
    if(request.action==='ack')return acknowledgeLease(client,invitationOutbox,request)
    return {jobs:await claimLeases<{id:string;name:string},InvitationJob>(client,invitationOutbox,{
      organizations:'SELECT id,name FROM app.organizations ORDER BY id',
      cleanup:org=>client.query("UPDATE app.organization_invitations i SET delivery_status='failed' WHERE organization_id=$1 AND status='pending' AND delivery_status='queued' AND NOT EXISTS(SELECT 1 FROM app.organization_memberships m WHERE m.organization_id=i.organization_id AND m.user_id=i.created_by AND m.status='active' AND (m.role='owner' OR (m.role='admin' AND i.role='member')))",[org.id]),
      select:`SELECT id,email,display_name AS "displayName",role,attempts FROM app.organization_invitations WHERE organization_id=$1 AND status='pending' AND delivery_status='queued' AND expires_at>now() AND next_attempt_at<=now() AND attempts<5 ORDER BY next_attempt_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,
      job:(row,org,leaseToken)=>({...row,organizationId:org.id,organizationName:org.name,attempts:Number(row.attempts)+1,leaseToken}) as InvitationJob,
    })}
  })
}
