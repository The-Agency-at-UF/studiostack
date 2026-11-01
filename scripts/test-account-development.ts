import {randomBytes,randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {readMetadata,withMaintenance,invokeMaintenance} from './deploy-dev-api'
import {aws,guardDevApply,devDirectory,pause,invoke} from './dev-aws'
import {syntheticSignIn,type TestIdentity} from './test-dev-auth'
import type {ManagedMember,OrganizationInvitation,OrganizationSettings,PendingInvitation} from '../src/types/accounts'
async function main(){
  await guardDevApply()
  const metadata=await readMetadata(),runId=`20261028-${randomBytes(4).toString('hex')}`,organizationId=randomUUID(),otherOrganizationId=randomUUID(),users:TestIdentity[]=[],checks:string[]=[]
  const fixture={action:'seed' as 'seed'|'cleanup',organizationId,otherOrganizationId,issuer:metadata.auth.Issuer,subjects:[] as string[]};let seeded=false,verified=false
  const cleanup={runId,organizationId,otherOrganizationId,subjects:fixture.subjects,fixtureCleanupPending:true}
  try{
    for(const label of ['owner','member','invitee'])users.push(await syntheticSignIn(metadata,runId,label))
    fixture.subjects.push(...users.map(u=>u.subject))
    await withMaintenance(metadata,runId,async()=>{if(!(await invokeMaintenance<{ok:boolean}>(fixture)).ok)throw new Error('Fixture seed failed');seeded=true})
    const [owner,member,invitee]=users,emails=users.map((_,i)=>`success+${runId}-${i}@simulator.amazonses.com`)
    for(let i=0;i<users.length;i++)await aws('cognito-idp','admin-update-user-attributes',['--user-pool-id',metadata.auth.UserPoolId,'--username',users[i].username,'--user-attributes',`Name=email,Value=${emails[i]}`,'Name=email_verified,Value=true'])
    async function call<T=Record<string,unknown>>(path:string,method:string,user:TestIdentity|undefined,body?:unknown,expected=200):Promise<T>{await pause(750);const res=await fetch(`https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com${path}`,{method,headers:{...(user?{Authorization:`Bearer ${user.token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000),redirect:'error'});if(res.status!==expected)throw new Error(`Account verification failed: ${method} ${path.replace(organizationId,'{org}')} (${res.status}, expected ${expected})`);checks.push(`${method} ${path.replace(organizationId,'{org}')}: ${expected}`);return expected===200?await res.json() as T:{} as T}
    for(const user of users)await call('/me','POST',user,{displayName:'Synthetic account verification'})
    const prefix=`/organizations/${organizationId}/administration`,profile=await call<{id:string}>('/me','GET',member)
    await call('/account/invitations','GET',undefined,undefined,401)
    let settings=await call<OrganizationSettings>(`${prefix}/settings`,'GET',owner)
    await call(`${prefix}/members`,'GET',member,undefined,403)
    await call(`${prefix}/members`,'GET',invitee,undefined,403)
    settings=await call<OrganizationSettings>(`${prefix}/settings`,'PATCH',owner,{name:`Synthetic ${runId}`,reservationDays:10,version:settings.version,requestId:randomUUID()})
    if(settings.reservationDays!==10)throw new Error('Settings did not persist')
    const members=await call<{items:ManagedMember[]}>(`${prefix}/members`,'GET',owner),person=members.items.find(m=>m.id===profile.id)!
    const suspended=await call<ManagedMember>(`${prefix}/members/${profile.id}`,'PATCH',owner,{role:'member',status:'suspended',version:person.version,requestId:randomUUID()})
    await call(`${prefix}/settings`,'GET',member,undefined,403)
    await call(`${prefix}/members/${profile.id}`,'PATCH',owner,{role:'member',status:'active',version:suspended.version,requestId:randomUUID()})
    const invite=await call<OrganizationInvitation>(`${prefix}/invitations`,'POST',owner,{email:emails[2],displayName:'Synthetic invitee',role:'member',requestId:randomUUID()})
    // Mailbox simulator only: never send verification mail to a teammate.
    const delivery=await invoke<{failed:number}>('studiostack-dev-accounts',{});if(delivery.failed)throw new Error('Synthetic invitation delivery failed')
    let delivered=false
    for(let i=0;i<10;i++){const page=await call<{items:OrganizationInvitation[]}>(`${prefix}/invitations`,'GET',owner),row=page.items.find(i=>i.id===invite.id);if(row?.deliveryStatus==='sent'){delivered=true;break}if(row&&['failed','uncertain'].includes(row.deliveryStatus))throw new Error('Simulator invitation was not delivered');await pause(1000)}
    if(!delivered)throw new Error('Simulator invitation delivery did not complete')
    await aws('cognito-idp','admin-update-user-attributes',['--user-pool-id',metadata.auth.UserPoolId,'--username',invitee.username,'--user-attributes','Name=email_verified,Value=false'])
    await call('/account/invitations','GET',invitee,undefined,403)
    await aws('cognito-idp','admin-update-user-attributes',['--user-pool-id',metadata.auth.UserPoolId,'--username',invitee.username,'--user-attributes','Name=email_verified,Value=true'])
    const list=await call<{items:PendingInvitation[]}>('/account/invitations','GET',invitee)
    if(!list.items.some(i=>i.id===invite.id&&i.organizationId===organizationId))throw new Error('Verified invitation inbox is missing the invitation')
    await call(`/account/invitations/${invite.id}/accept`,'POST',member,{organizationId},404)
    await call(`/account/invitations/${invite.id}/accept`,'POST',invitee,{organizationId,identity:{email:emails[2]}},400)
    await call(`/account/invitations/${invite.id}/accept`,'POST',invitee,{organizationId})
    await call(`/account/invitations/${invite.id}/accept`,'POST',invitee,{organizationId})
    await call(`${prefix}/settings`,'GET',invitee)
    await call(`${prefix}/members`,'GET',invitee,undefined,403)
    await call(`${prefix}/activity`,'GET',owner)
    verified=true;console.log(`Live account verification passed ${checks.length} checks using isolated fixtures and SES simulator`)
  }finally{
    await writeFile(`${devDirectory}/account-verification-cleanup.json`,JSON.stringify(cleanup,null,2))
    if(seeded)await withMaintenance(metadata,runId,async()=>{if(!(await invokeMaintenance<{ok:boolean}>({...fixture,action:'cleanup'})).ok)throw new Error('Fixture cleanup failed')})
    for(const user of users)await aws('cognito-idp','admin-delete-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',user.username])
    cleanup.fixtureCleanupPending=false;await writeFile(`${devDirectory}/account-verification-cleanup.json`,JSON.stringify(cleanup,null,2))
    if(verified)await writeFile(`${devDirectory}/account-verification.json`,JSON.stringify({runId,checks,verifiedAt:new Date().toISOString(),cleanupPending:false},null,2))
    console.log('Synthetic account fixtures and Cognito users removed')
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Account verification failed');process.exitCode=1})
