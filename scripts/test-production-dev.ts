import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { aws, guardDevApply, devDirectory, pause } from './dev-aws'
import { readMetadata, withMaintenance, invokeMaintenance } from './deploy-dev-api'
import { syntheticSignIn, type TestIdentity } from './test-dev-auth'
import { emptyBrief, type ProductionBrief } from '../src/types/production'
async function ownedKey(key:string,org:string) { if (!key.includes(org)) throw new Error('Unowned verification object') }
async function removeSyntheticAccounts(pool:string,users:TestIdentity[]) {
  let failed=false
  for(const user of users) {
    try {await aws('cognito-idp','admin-delete-user',['--user-pool-id',pool,'--username',user.username])}
    catch(error) {if((error as {code?:string}).code!=='UserNotFoundException')failed=true}
  }
  if(failed)throw new Error('Some synthetic accounts could not be removed; inspect the cleanup manifest')
}
async function main() {
  await guardDevApply()
  const metadata=await readMetadata(),runId=`20261027-${randomBytes(4).toString('hex')}`,organizationId=randomUUID(),otherOrganizationId=randomUUID(),users:TestIdentity[]=[],checks:string[]=[],keys:string[]=[]
  const fixture={action:'seed' as 'seed'|'cleanup',organizationId,otherOrganizationId,issuer:metadata.auth.Issuer,subjects:[] as string[]}
  let seeded=false,verified=false
  const record={runId,organizationId,otherOrganizationId,subjects:fixture.subjects,keys,fixtureCleanupPending:true}
  try {
    for(const label of ['owner','member','outsider']) users.push(await syntheticSignIn(metadata,runId,label))
    for (const identity of users.slice(0,2)) await aws('cognito-idp','admin-update-user-attributes',['--user-pool-id',metadata.auth.UserPoolId,'--username',identity.username,'--user-attributes','Name=email,Value=success@simulator.amazonses.com','Name=email_verified,Value=true'])
    fixture.subjects.push(...users.map(u=>u.subject));record.subjects=fixture.subjects
    await withMaintenance(metadata,runId,async()=>{const result=await invokeMaintenance<{ok:boolean}>(fixture);if(!result.ok)throw new Error('Synthetic fixtures were not created');seeded=true})
    const [owner,member,outsider]=users,base='https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com',prefix=`/organizations/${organizationId}/production`
    async function call<T=Record<string,unknown>>(path:string,method:string,identity:TestIdentity|undefined,body?:unknown,expected=200):Promise<T> {
      await pause(650)
      const response=await fetch(`${base}${path}`,{method,headers:{...(identity?{Authorization:`Bearer ${identity.token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(35000)})
      if(response.status!==expected)throw new Error(`Production verification failed for ${method} ${path.replace(organizationId,'{org}')}: ${response.status}, expected ${expected}`)
      checks.push(`${method} ${path.replace(organizationId,'{org}')}: ${expected}`)
      return response.status===200?await response.json() as T:{} as T
    }
    for(const identity of users)await call('/me','POST',identity,{displayName:'Synthetic production verification'})
    const ownerProfile=await call<{id:string}>('/me','GET',owner)
    await call(`${prefix}/access`,'GET',undefined,undefined,401)
    await call(`${prefix}/settings`,'PATCH',member,{version:0,reviewerIds:[],executiveIds:[],approvalConfirmsDates:true},403)
    await call(`${prefix}/settings`,'PATCH',owner,{version:0,reviewerIds:[ownerProfile.id],executiveIds:[ownerProfile.id],approvalConfirmsDates:true})
    await call(`${prefix}/access`,'GET',owner)
    const data={...emptyBrief(),projectName:'Synthetic production request',client:'Synthetic client',managers:'Synthetic manager',deliveryDate:new Date(Date.now()+30*86400_000).toISOString().slice(0,10),productionTypes:['Videography' as const],fields:{summary:'Synthetic test brief.',objective:'Verify persistence.',audience:'Test audience',platform:'Test platform',deliverables:'One synthetic film.',location:'Test studio',shootEstimate:'Next week',proposedStart:new Date(Date.now()+7*86400_000).toISOString().slice(0,10),proposedEnd:new Date(Date.now()+7*86400_000).toISOString().slice(0,10)}}
    const create={data,requestId:randomUUID()}
    let brief=await call<ProductionBrief>(`${prefix}/briefs`,'POST',member,create)
    if((await call<ProductionBrief>(`${prefix}/briefs`,'POST',member,create)).id!==brief.id)throw new Error('Draft creation was not idempotent')
    const path=`${prefix}/briefs/${brief.id}`
    await call(path,'GET',outsider,undefined,403);await call(path,'GET',owner)
    // Real private PDF upload and pinned immutable display object.
    const bytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'),id=randomUUID()
    const upload=await call<{url:string;fields:Record<string,string>}>(`${path}/attachments`,'POST',member,{id,name:'synthetic-reference.pdf',contentType:'application/pdf',size:bytes.length})
    keys.push(upload.fields.key,`briefs/${organizationId}/${brief.id}/${id}`)
    const form=new FormData();Object.entries(upload.fields).forEach(([k,v])=>form.append(k,v));form.append('file',new Blob([bytes],{type:'application/pdf'}),'synthetic.pdf')
    const uploaded=await fetch(upload.url,{method:'POST',body:form,redirect:'error'});if(!uploaded.ok)throw new Error(`Private PDF POST failed: ${uploaded.status}`);checks.push('Private PDF staging upload: passed')
    brief=await call<ProductionBrief>(`${path}/attachments/${id}/complete`,'POST',member,{})
    const download=await call<{url:string}>(`${path}/attachments/${id}`,'GET',member)
    const fetched=await fetch(download.url,{redirect:'error'}),downloaded=Buffer.from(await fetched.arrayBuffer())
    if(!fetched.ok||createHash('sha256').update(bytes).digest('hex')!==createHash('sha256').update(downloaded).digest('hex'))throw new Error('Private PDF bytes differed')
    if(!fetched.headers.get('content-disposition')?.startsWith('attachment'))throw new Error('PDF download must use attachment disposition')
    checks.push('Private PDF download: exact bytes and attachment disposition')
    const unsigned=new URL(download.url);unsigned.search='';if((await fetch(unsigned)).status!==403)throw new Error('Attachment was public');checks.push('Unsigned attachment read: 403')
    const submit={action:'submit',version:brief.version,requestId:randomUUID()};brief=await call<ProductionBrief>(`${path}/actions`,'POST',member,submit)
    await call(path,'PATCH',member,{data,version:brief.version,requestId:randomUUID()},403)
    await call(`${path}/actions`,'POST',member,{action:'approve',version:brief.version,requestId:randomUUID()},403)
    const approval={action:'approve',version:brief.version,requestId:randomUUID()};brief=await call<ProductionBrief>(`${path}/actions`,'POST',owner,approval)
    if(brief.status!=='approved'||!brief.shootStartsAt||brief.events.at(-1)?.kind!=='approved')throw new Error('Approval did not confirm the shoot and record history')
    await call(`${path}/actions`,'POST',owner,approval)
    const deliveries=await call<{items:{briefId:string}[]}>(`${prefix}/deliveries`,'GET',owner)
    if(deliveries.items.filter(d=>d.briefId===brief.id).length!==2)throw new Error('Decision did not create exactly one author and one ELT notification')
    let emailSent=false
    for(let attempt=0;attempt<40;attempt++) {
      const states=await call<{items:{briefId:string;status:string}[]}>(`${prefix}/deliveries`,'GET',owner)
      const own=states.items.filter(d=>d.briefId===brief.id)
      if(own.length===2&&own.every(d=>d.status==='sent')) {emailSent=true;break}
      if(own.some(d=>['failed','uncertain'].includes(d.status)))throw new Error('Synthetic decision email delivery failed')
      await pause(2000)
    }
    if(!emailSent)throw new Error('Synthetic decision emails were not delivered within the verification window')
    checks.push('Author and ELT decision emails accepted by the AWS mailbox simulator')
    await call(`${prefix}/deliveries`,'GET',member,undefined,403)
    brief=await call<ProductionBrief>(`${path}/actions`,'POST',owner,{action:'request_changes',version:brief.version,requestId:randomUUID(),comment:'Clarify the deliverables.',section:'Deliverables'})
    if(brief.shootStartsAt)throw new Error('Requested changes did not clear shoot confirmation')
    brief=await call<ProductionBrief>(path,'PATCH',member,{data:{...data,fields:{...data.fields,deliverables:'One film and one cutdown.'}},version:brief.version,requestId:randomUUID()})
    brief=await call<ProductionBrief>(`${path}/actions`,'POST',member,{action:'submit',version:brief.version,requestId:randomUUID()})
    if(brief.submission!==2||brief.events.filter(e=>e.kind==='submitted').length!==2)throw new Error('Resubmission history missing')
    await call(`${prefix}/briefs`,'GET',owner);await call(`${prefix}/settings`,'GET',owner)
    await writeFile(`${devDirectory}/production-verification.json`,JSON.stringify({runId,checks,verifiedAt:new Date().toISOString(),cleanupPending:true},null,2))
    verified=true;console.log(`Passed ${checks.length} live development production-workflow checks`)
  } catch(error) {
    console.error(`Live verification stopped after ${checks.length} completed checks; cleaning isolated fixtures`)
    throw error
  } finally {
    await writeFile(`${devDirectory}/production-verification-cleanup.json`,JSON.stringify(record,null,2))
    try {
      if(seeded) await withMaintenance(metadata,runId,async()=>{const result=await invokeMaintenance<{ok:boolean}>({...fixture,action:'cleanup'});if(!result.ok)throw new Error('Fixture cleanup failed')})
      for(const key of keys) { await ownedKey(key,organizationId);await aws('s3api','delete-object',['--bucket','studio-stack-photos-dev','--key',key]) }
      record.fixtureCleanupPending=false;await writeFile(`${devDirectory}/production-verification-cleanup.json`,JSON.stringify(record,null,2))
    } finally {await removeSyntheticAccounts(metadata.auth.UserPoolId,users)}
    if(verified)await writeFile(`${devDirectory}/production-verification.json`,JSON.stringify({runId,checks,verifiedAt:new Date().toISOString(),cleanupPending:false},null,2))
    console.log('Synthetic development accounts and fixtures cleaned up')
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production verification failed');process.exitCode=1})
