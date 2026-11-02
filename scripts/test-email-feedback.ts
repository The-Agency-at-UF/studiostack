import {randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {aws,invoke,pause,devDirectory} from './dev-aws'
import {guardProductionApply,approvedProductionEmail} from './prod-aws'
import {emailHash} from '../backend/email/feedback'
async function main(){
 await guardProductionApply();const checks:{environment:string;kind:string;recipientHash:string;suppressed:boolean}[]=[]
 // Both environment-specific event destinations and sender configurations must
 // exist before replacing direct feedback mail with the monitored SNS pipeline.
 for(const env of ['dev','prod']){await aws('sesv2','get-configuration-set',['--configuration-set-name',`studiostack-${env}-delivery`]);for(const suffix of ['accounts','production-notifications']){const f=await aws<{Environment:{Variables:Record<string,string>}}>('lambda','get-function-configuration',['--function-name',`studiostack-${env}-${suffix}`]);if(f.Environment.Variables.SES_CONFIGURATION_SET!==`studiostack-${env}-delivery`)throw new Error('A sender is missing its environment feedback configuration')}}
 await aws('sesv2','put-email-identity-feedback-attributes',['--email-identity',approvedProductionEmail,'--no-email-forwarding-enabled'])
 for(const env of ['dev','prod'])for(const kind of ['bounce','complaint']){
  const address=`${kind}+studiostack-${randomUUID()}@simulator.amazonses.com`,hash=emailHash(address),backend=`studiostack-${env}-database`
  const before=await invoke<{allowed:boolean}>(backend,{task:'email-feedback',action:'check',emailHash:hash});if(!before.allowed)throw new Error('Fresh simulator recipient unexpectedly suppressed')
  await aws('sesv2','send-email',['--from-email-address',approvedProductionEmail,'--destination',JSON.stringify({ToAddresses:[address]}),'--configuration-set-name',`studiostack-${env}-delivery`,'--content',JSON.stringify({Simple:{Subject:{Data:'StudioStack controlled feedback verification'},Body:{Text:{Data:'SES simulator only. Verifies bounce or complaint handling.'}}}})])
  let suppressed=false;for(let attempt=0;attempt<45;attempt++){await pause(2000);const after=await invoke<{allowed:boolean}>(backend,{task:'email-feedback',action:'check',emailHash:hash});if(after.allowed===false){suppressed=true;break}}if(!suppressed)throw new Error(env+' '+kind+' feedback did not arrive; inspect private failed-event queue')
  checks.push({environment:env,kind,recipientHash:hash,suppressed});console.log(env+' '+kind+' suppressed through real SES/SNS/private storage')
 }
 await writeFile(devDirectory+'/email-feedback-verification.json',JSON.stringify({checks,verifiedAt:new Date().toISOString(),simulatorOnly:true},null,2));console.log('All four real bounce/complaint checks passed; only hashed provider audit records retained')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Email feedback verification failed');process.exitCode=1})
