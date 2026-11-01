import {aws} from './dev-aws'
import {guardProductionApply,productionMetadata} from './prod-aws'
import {withProductionMaintenance,invokeProductionMaintenance} from './production-database'
import {approvedAgencyOwnerEmail,approvedFormerOwnerEmail} from '../backend/production/owner-handover'
// Run `npm run db:api:prepare` first so the temporary setup package contains the handover action.
async function identity(userPoolId:string,email:string){
 const {Users}=await aws<{Users:{Attributes:{Name:string;Value:string}[]}[]}>('cognito-idp','list-users',['--user-pool-id',userPoolId,'--filter',`email = "${email}"`])
 if(Users.length>1)throw new Error(`Ambiguous production identity for ${email}`)
 const attributes=Object.fromEntries((Users[0]?.Attributes??[]).map(a=>[a.Name,a.Value]))
 return attributes.sub&&attributes.email===email?{subject:attributes.sub,email}:null
}
async function main(){
 await guardProductionApply();const metadata=await productionMetadata()
 const owner=await identity(metadata.auth.UserPoolId,approvedAgencyOwnerEmail)
 if(!owner)throw new Error('The new owner has no production sign-in yet; sign in once, then retry')
 const formerOwner=await identity(metadata.auth.UserPoolId,approvedFormerOwnerEmail)
 await withProductionMaintenance(async()=>{
  const result=await invokeProductionMaintenance<{ok:boolean;owner:unknown;formerOwner:unknown;activeOwners:number}>({action:'hand-over-agency-ownership',owner,...(formerOwner?{formerOwner}:{})})
  if(!result.ok)throw new Error('Ownership handover did not verify')
  console.log(JSON.stringify({owner:result.owner,formerOwner:result.formerOwner,activeOwners:result.activeOwners}))
 })
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Ownership handover failed');process.exitCode=1})
