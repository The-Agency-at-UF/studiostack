import {aws} from './dev-aws'
import {guardProductionApply,productionMetadata} from './prod-aws'
import {withProductionMaintenance,invokeProductionMaintenance} from './production-database'
import {approvedRepairEmail} from '../backend/production/stale-account'
// Moves the approved email from a stale account (its sign-in deleted) to the account the live
// sign-in uses, and suspends the stale account's memberships. Both runs need --apply-prod, since even
// reading the plan deploys the temporary maintenance function:
//   1. node --import=tsx scripts/retire-stale-production-account.ts --apply-prod   (prints the plan only)
//   2. CONFIRM_STALE_ACCOUNT=<staleAccount from step 1> node --import=tsx scripts/retire-stale-production-account.ts --apply-prod
// Run `npm run db:api:prepare` first so the temporary setup package contains this action.
type Plan={ok:boolean;changed:boolean;liveAccount:string;staleAccount:string|null;staleSubject?:string;memberships?:{organizationId:string;role:string;status:string}[]}
type Users={Users:{Attributes:{Name:string;Value:string}[]}[]}
async function main(){
 await guardProductionApply()
 const confirmed=process.env.CONFIRM_STALE_ACCOUNT
 const {auth:{UserPoolId:pool}}=await productionMetadata()
 const {Users}=await aws<Users>('cognito-idp','list-users',['--user-pool-id',pool,'--filter',`email = "${approvedRepairEmail}"`])
 if(Users.length!==1)throw new Error(`Expected exactly one production sign-in for ${approvedRepairEmail}`)
 const attributes=Object.fromEntries(Users[0].Attributes.map(a=>[a.Name,a.Value]))
 if(attributes.email!==approvedRepairEmail||attributes.email_verified!=='true'||!attributes.sub)throw new Error('The live sign-in has no verified email')
 const current={subject:attributes.sub,email:approvedRepairEmail}
 await withProductionMaintenance(async()=>{
  const plan=await invokeProductionMaintenance<Plan>({action:'retire-stale-account',current})
  console.log(JSON.stringify({plan:true,...plan}))
  if(!plan.staleAccount||!plan.staleSubject){console.log('Nothing to repair');return}
  // The stale account's own sign-in must be gone, or two real people would share one email.
  const stale=await aws<Users>('cognito-idp','list-users',['--user-pool-id',pool,'--filter',`sub = "${plan.staleSubject}"`])
  if(stale.Users.length)throw new Error('The stale account still has a production sign-in; an administrator must review it')
  if(confirmed!==plan.staleAccount){console.log(confirmed?'CONFIRM_STALE_ACCOUNT does not match the plan; nothing changed':'Plan only. Re-run with CONFIRM_STALE_ACCOUNT='+plan.staleAccount+' to apply.');return}
  const result=await invokeProductionMaintenance<Plan>({action:'retire-stale-account',current,staleSubject:plan.staleSubject,apply:true})
  if(!result.ok||!result.changed||result.staleAccount!==plan.staleAccount)throw new Error('Account repair did not verify')
  console.log(JSON.stringify({applied:true,liveAccount:result.liveAccount,staleAccount:result.staleAccount,memberships:result.memberships}))
 })
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Account repair failed');process.exitCode=1})
