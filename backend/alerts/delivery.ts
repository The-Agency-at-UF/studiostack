import type {AlertJob,AlertOutboxRequest} from './outbox'
export function alertEmail(job:AlertJob,webUrl:string){return {subject:('StudioStack: '+job.title).replace(/[\r\n]/g,' ').slice(0,200),text:[job.title,'',job.message,'',new URL(job.targetPath,webUrl).href,'','Manage optional equipment email in StudioStack → Alerts.'].join('\n')}}
export async function deliverAppAlerts(deps:{store:(r:AlertOutboxRequest)=>Promise<{jobs?:AlertJob[];allowed?:boolean;updated?:boolean}>;send:(j:AlertJob)=>Promise<void>}){
 const {jobs=[]}=await deps.store({action:'claim'});let sent=0,failed=0,skipped=0
 for(const job of jobs){let outcome:'sent'|'retry'|'failed'|'uncertain'|'skipped'='sent'
  try{const allowed=await deps.store({action:'authorize',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken});if(!allowed.allowed){outcome='skipped';skipped++}else{await deps.send(job);sent++}}
  catch(error){const name=(error as {name?:string}).name;outcome=['TooManyRequestsException','ThrottlingException','LimitExceededException'].includes(name??'')?'retry':['MessageRejected','MailFromDomainNotVerifiedException','AccountSuspendedException','SendingPausedException','BadRequestException','UnverifiedRecipient','UserNotFoundException'].includes(name??'')?'failed':'uncertain';failed++}
  const ack=await deps.store({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome});if(!ack.updated)throw new Error('Alert acknowledgement failed; inspect delivery lease')
 }
 return {claimed:jobs.length,sent,failed,skipped}
}
