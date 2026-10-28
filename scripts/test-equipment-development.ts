import {randomBytes,randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {readMetadata,withMaintenance,invokeMaintenance} from './deploy-dev-api'
import {aws,guardDevApply,devDirectory,pause,invoke} from './dev-aws'
import {syntheticSignIn,type TestIdentity} from './test-dev-auth'
import type {EquipmentRecord,EquipmentReservation,EquipmentReport} from '../src/types/equipment'
import type {AppAlert} from '../src/types/alerts'
async function main(){
 await guardDevApply();const metadata=await readMetadata(),runId=`20261028-${randomBytes(4).toString('hex')}`,organizationId=randomUUID(),otherOrganizationId=randomUUID(),users:TestIdentity[]=[],checks:string[]=[]
 const fixture={action:'seed' as 'seed'|'cleanup',organizationId,otherOrganizationId,issuer:metadata.auth.Issuer,subjects:[] as string[]};let seeded=false,verified=false
 try{
  for(const label of ['owner','member','outsider'])users.push(await syntheticSignIn(metadata,runId,label));fixture.subjects.push(...users.map(u=>u.subject))
  await withMaintenance(metadata,runId,async()=>{if(!(await invokeMaintenance<{ok:boolean}>(fixture)).ok)throw new Error('Equipment fixture seed failed');seeded=true})
  const [owner,member,outsider]=users
  for(let i=0;i<users.length;i++)await aws('cognito-idp','admin-update-user-attributes',['--user-pool-id',metadata.auth.UserPoolId,'--username',users[i].username,'--user-attributes',`Name=email,Value=success+${runId}-${i}@simulator.amazonses.com`,'Name=email_verified,Value=true'])
  async function call<T=Record<string,unknown>>(path:string,method:string,user:TestIdentity|undefined,body?:unknown,expected=200):Promise<T>{await pause(800);const r=await fetch(`https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com${path}`,{method,headers:{...(user?{Authorization:`Bearer ${user.token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000),redirect:'error'});if(r.status!==expected)throw new Error(`Equipment check failed: ${method} ${path.replace(organizationId,'{org}')} (${r.status}, expected ${expected})`);checks.push(`${method} ${path.replace(organizationId,'{org}')}: ${expected}`);return expected===200?await r.json() as T:{} as T}
  const org=`/organizations/${organizationId}`,gear=org+'/equipment',alerts=org+'/alerts'
  for(const user of users)await call('/me','POST',user,{displayName:'Synthetic equipment verification'})
  await call(org+'/inventory','GET',undefined,undefined,401);await call(org+'/inventory','GET',outsider,undefined,403)
  const input={name:'Synthetic camera',category:'Camera & Accessories',equipmentCode:'DRILL-'+runId},item=await call<EquipmentRecord>(org+'/inventory','POST',owner,input)
  await call(org+'/inventory','POST',member,{...input,equipmentCode:'MEMBER-'+runId},403)
  const startsAt=new Date(Date.now()+5*60000).toISOString(),endsAt=new Date(Date.now()+65*60000).toISOString(),booking={name:'Synthetic shoot',startsAt,endsAt,equipmentIds:[item.id],requestId:randomUUID()}
  let row=await call<EquipmentReservation>(org+'/reservations','POST',member,booking)
  if((await call<EquipmentReservation>(org+'/reservations','POST',member,booking)).id!==row.id)throw new Error('Booking command was not idempotent')
  await call(org+'/reservations','POST',member,{...booking,requestId:randomUUID()},409)
  await call(gear+'/availability?'+new URLSearchParams({startsAt,endsAt}),'GET',member)
  row=await call<EquipmentReservation>(gear+`/reservations/${row.id}`,'PATCH',member,{...booking,name:'Extended synthetic shoot',endsAt:new Date(Date.parse(endsAt)+15*60000).toISOString(),version:row.version,requestId:randomUUID()})
  const checkout={version:row.version,conditions:[{equipmentId:item.id,condition:'good',notes:'Fixture pickup.'}],requestId:randomUUID()}
  row=await call<EquipmentReservation>(gear+`/reservations/${row.id}/checkout`,'POST',member,checkout)
  await call(gear+`/reservations/${row.id}/checkout`,'POST',member,checkout)
  if(row.fulfillmentStatus!=='checked_out')throw new Error('Checkout did not persist')
  const inventory=await call<{items:EquipmentRecord[]}>(org+'/inventory','GET',member);if(!inventory.items.find(i=>i.id===item.id)?.checkedOut)throw new Error('Physical checkout not visible')
  await call(org+`/reservations/${row.id}/cancel`,'POST',member,{},409)
  const returned={version:row.version,conditions:[{equipmentId:item.id,condition:'damaged',notes:'Synthetic damaged mount.'}],requestId:randomUUID()}
  row=await call<EquipmentReservation>(gear+`/reservations/${row.id}/return`,'POST',member,returned)
  await call(gear+`/reservations/${row.id}/return`,'POST',member,returned)
  if(row.fulfillmentStatus!=='returned')throw new Error('Return did not persist')
  const reports=await call<{items:EquipmentReport[]}>(gear+'/reports','GET',owner),report=reports.items.find(r=>r.equipmentId===item.id)!
  if(!report||reports.items.length!==1||report.severity!=='high')throw new Error('Damaged return did not create one report')
  await call(alerts+'/preferences','PATCH',member,{equipmentEmail:true,version:0})
  const comment={message:'Synthetic repair update.',requestId:randomUUID()};await call(gear+`/reports/${report.id}/activity`,'POST',owner,comment);await call(gear+`/reports/${report.id}/activity`,'POST',owner,comment)
  const memberAlerts=await call<{items:AppAlert[]}>(alerts,'GET',member),notice=memberAlerts.items.find(a=>a.targetPath.endsWith(report.id))!
  if(!notice||notice.emailStatus!=='pending')throw new Error('Opt-in report alert was not queued')
  await call(alerts+`/${notice.id}/read`,'POST',owner,{},404);await call(alerts+`/${notice.id}/read`,'POST',member,{})
  const delivery=await invoke<{alerts:{failed:number;sent:number}}>('studiostack-dev-production-notifications',{});if(delivery.alerts.failed||delivery.alerts.sent<1)throw new Error('Simulator equipment email delivery failed')
  const resolve={status:'resolved',resolution:'Fixture mount repaired.',restoreService:true,condition:'good',version:report.version,requestId:randomUUID()}
  await call(gear+`/reports/${report.id}`,'PATCH',member,resolve,403);await call(gear+`/reports/${report.id}`,'PATCH',owner,resolve)
  const restored=await call<{items:EquipmentRecord[]}>(org+'/inventory','GET',member);if(restored.items.find(i=>i.id===item.id)?.status!=='available')throw new Error('Resolution did not restore equipment')
  await call(gear+`/reservations/${row.id}/activity`,'GET',member);await call(gear+'/reports','GET',outsider,undefined,403)
  await call(alerts+'/preferences','PATCH',member,{equipmentEmail:false,version:1})
  verified=true;console.log(`Equipment development verification passed ${checks.length} live checks; simulator email only`)
 }finally{
  await writeFile(`${devDirectory}/equipment-cleanup.json`,JSON.stringify({runId,...fixture,fixtureCleanupPending:seeded},null,2))
  if(seeded)await withMaintenance(metadata,runId,async()=>{if(!(await invokeMaintenance<{ok:boolean}>({...fixture,action:'cleanup'})).ok)throw new Error('Equipment fixture cleanup failed')})
  for(const user of users)await aws('cognito-idp','admin-delete-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',user.username])
  await writeFile(`${devDirectory}/equipment-cleanup.json`,JSON.stringify({runId,fixtureCleanupPending:false},null,2));if(verified)await writeFile(`${devDirectory}/equipment-verification.json`,JSON.stringify({runId,checks,verifiedAt:new Date().toISOString(),cleanupPending:false},null,2));console.log('Synthetic equipment fixtures and Cognito accounts removed')
 }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Equipment development verification failed');process.exitCode=1})
