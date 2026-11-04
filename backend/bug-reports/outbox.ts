import {inTransaction,type DatabaseClient} from '../database/client'
import {acknowledgeLease,claimLeases,type LeasedOutbox} from '../database/leased-outbox'
import {object,uuid} from '../database/api-validation'
import type {FeedbackKind} from '../../src/types/database-api'
export interface BugReportJob {id:string;organizationId:string;organizationName:string;kind:FeedbackKind;title:string;description:string;pagePath:string;reporterEmail:string;reporterName:string|null;createdAt:string;leaseToken:string}
export type BugReportOutboxRequest={action:'claim'}|{action:'ack';organizationId:string;id:string;leaseToken:string;outcome:'sent'|'retry'|'failed'|'uncertain'}
export function bugReportOutboxRequest(input:unknown):BugReportOutboxRequest{const v=object(input,['action','organizationId','id','leaseToken','outcome']);if(v.action==='claim'){object(input,['action']);return {action:'claim'}}if(v.action!=='ack'||!['sent','retry','failed','uncertain'].includes(String(v.outcome)))throw new Error('Invalid bug report outbox request');return {action:'ack',organizationId:uuid(v.organizationId),id:uuid(v.id),leaseToken:uuid(v.leaseToken),outcome:v.outcome as 'sent'|'retry'|'failed'|'uncertain'}}
const bugReportOutbox:LeasedOutbox={table:'bug_reports',status:'email_status',pending:'pending',deliveredAt:'sent_at',feedbackColumn:'delivery_id',suppressedOutcome:'suppressed'}
/** Reports go to one configured support address, so there is no per-recipient authorization step. */
export async function bugReportOutboxTask(client:DatabaseClient,r:BugReportOutboxRequest):Promise<{jobs?:BugReportJob[];updated?:boolean}>{
 return inTransaction(client,async()=>{
  if(r.action==='ack')return acknowledgeLease(client,bugReportOutbox,r)
  return {jobs:await claimLeases<{id:string;name:string},BugReportJob>(client,bugReportOutbox,{
   organizations:'SELECT id,name FROM app.organizations ORDER BY id',
   cleanup:async()=>undefined,
   select:`SELECT b.id,b.kind,b.title,b.description,b.page_path AS "pagePath",b.created_at AS "createdAt",u.email AS "reporterEmail",u.display_name AS "reporterName" FROM app.bug_reports b JOIN app.users u ON u.id=b.reported_by WHERE b.organization_id=$1 AND b.email_status='pending' AND b.next_attempt_at<=now() AND b.attempts<5 ORDER BY b.next_attempt_at,b.id LIMIT $2 FOR UPDATE OF b SKIP LOCKED`,
   job:(row,org,leaseToken)=>({...row,createdAt:new Date(row.createdAt as string).toISOString(),organizationId:org.id,organizationName:org.name,leaseToken}) as BugReportJob,
  })}
 })
}
