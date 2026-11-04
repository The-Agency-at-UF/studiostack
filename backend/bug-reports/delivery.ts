import {deliverLeased,rejectedSesErrors} from '../email/delivery'
import type {BugReportJob,BugReportOutboxRequest} from './outbox'
export function bugReportEmail(job:BugReportJob,webUrl:string){
 const reporter=job.reporterName?`${job.reporterName} <${job.reporterEmail}>`:job.reporterEmail
 return {subject:`StudioStack bug report: ${job.title}`.replace(/[\r\n]/g,' ').slice(0,200),text:[
  `Bug report · ${job.organizationName}`,'',`Title: ${job.title}`,`From: ${reporter}`,`Page: ${new URL(job.pagePath,webUrl).href}`,`Submitted: ${job.createdAt}`,`Report ID: ${job.id}`,'','Description:',job.description,
 ].join('\n')}
}
export async function deliverBugReports(deps:{store:(r:BugReportOutboxRequest)=>Promise<{jobs?:BugReportJob[];updated?:boolean}>;send:(j:BugReportJob)=>Promise<void>}){
 const {jobs=[]}=await deps.store({action:'claim'})
 return deliverLeased({jobs,rejected:rejectedSesErrors,ackError:'Bug report acknowledgement failed; inspect delivery lease',
  deliver:async job=>{await deps.send(job);return 'sent' as const},
  ack:(job,outcome)=>deps.store({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome})})
}
