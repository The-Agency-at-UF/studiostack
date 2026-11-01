import {deliverLeased,rejectedSesErrors} from '../email/delivery'
import type {AlertJob,AlertOutboxRequest} from './outbox'
export function alertEmail(job:AlertJob,webUrl:string){return {subject:('StudioStack: '+job.title).replace(/[\r\n]/g,' ').slice(0,200),text:[job.title,'',job.message,'',new URL(job.targetPath,webUrl).href,'','Manage optional equipment email in StudioStack → Alerts.'].join('\n')}}
export async function deliverAppAlerts(deps:{store:(r:AlertOutboxRequest)=>Promise<{jobs?:AlertJob[];allowed?:boolean;updated?:boolean}>;send:(j:AlertJob)=>Promise<void>}){
 const {jobs=[]}=await deps.store({action:'claim'}),lease=(job:AlertJob)=>({organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken})
 return deliverLeased({jobs,rejected:rejectedSesErrors,ackError:'Alert acknowledgement failed; inspect delivery lease',
  deliver:async job=>{if(!(await deps.store({action:'authorize',...lease(job)})).allowed)return 'skipped' as const;await deps.send(job);return 'sent' as const},
  ack:(job,outcome)=>deps.store({action:'ack',...lease(job),outcome})})
}
