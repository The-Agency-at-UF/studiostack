import {isApplicationPagePath} from './page-path'
import {deliverLeased,prepareDelivery,rejectedSesErrors} from '../email/delivery'
import type {BugReportJob,BugReportOutboxRequest} from './outbox'
export function bugReportEmail(job:BugReportJob,webUrl:string){
 const label=job.kind==='feature'?'Feature request':'Bug report',reporter=job.reporterName?`${job.reporterName} <${job.reporterEmail}>`:job.reporterEmail
 const page=isApplicationPagePath(job.pagePath)?new URL(job.pagePath,webUrl):null
 const pageLine=page?.origin===new URL(webUrl).origin?[`Page: ${page.href}`]:[]
 return {subject:`StudioStack ${label.toLowerCase()}: ${job.title}`.replace(/[\r\n]/g,' ').slice(0,200),text:[
  `${label} · ${job.organizationName}`,'',`Title: ${job.title}`,`From: ${reporter}`,...pageLine,`Submitted: ${job.createdAt}`,`Report ID: ${job.id}`,'','Description:',job.description,
 ].join('\n')}
}
export async function deliverBugReports(deps:{store:(r:BugReportOutboxRequest)=>Promise<{jobs?:BugReportJob[];updated?:boolean}>;send:(j:BugReportJob)=>Promise<void>;prepare?:(j:BugReportJob)=>Promise<void>}){
 const {jobs=[]}=await deps.store({action:'claim'})
 return deliverLeased({jobs,rejected:rejectedSesErrors,ackError:'Bug report acknowledgement failed; inspect delivery lease',
  deliver:async job=>{
    await prepareDelivery(async()=>deps.prepare?.(job))
    if(!(await prepareDelivery(()=>deps.store({action:'begin',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken}))).updated)
      throw Object.assign(new Error('Bug report lease unavailable'),{name:'DeliveryPreparationError'})
    await deps.send(job)
    return 'sent' as const
  },
  ack:(job,outcome)=>deps.store({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome})})
}
