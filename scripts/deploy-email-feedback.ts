import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {emailFeedbackInfrastructure} from '../infra/production/email-feedback'
import {aws,applyStack,devDirectory,guardDevApply,invoke,pause} from './dev-aws'
import {guardProductionApply,prodDirectory} from './prod-aws'
import {emailHash} from '../backend/email/feedback'
const execute=promisify(execFile)
async function main(){
 const env=process.argv.slice(2).join(' ')==='--apply-dev'?'dev':process.argv.slice(2).join(' ')==='--apply-prod'?'prod':undefined;if(!env)throw new Error('Explicit approved environment required');if(env==='dev')await guardDevApply();else await guardProductionApply()
 const fn=`studiostack-${env}-database`;let ready=false
 for(let attempt=0;attempt<2;attempt++){const value=await invoke<{allowed?:boolean}>(fn,{task:'email-feedback',action:'check',emailHash:emailHash('success+feedback-probe@simulator.amazonses.com')});if(typeof value.allowed==='boolean'){ready=true;break}if(attempt===0)await pause(15000)}if(!ready)throw new Error('Deploy migration 008 and feedback-capable private runtime first')
 const directory=resolve('.aws/email-feedback/'+env);await mkdir(directory,{recursive:true});await execute(resolve('node_modules/.bin/esbuild'),['backend/email/feedback.ts','--bundle','--platform=node','--target=node24','--format=cjs',`--outfile=${directory}/index.js`]);const archive=resolve(directory+`/handler-${Date.now()}.zip`);await execute('zip',['-q',archive,'index.js'],{cwd:directory});const key=`deployments/email-feedback/${Date.now()}/handler.zip`;await aws('s3api','put-object',['--bucket',`studio-stack-photos-${env}`,'--key',key,'--body',archive,'--server-side-encryption','AES256'])
 const outputs=await applyStack(`studiostack-${env}-email-feedback`,emailFeedbackInfrastructure({environment:env,artifactKey:key}));await writeFile((env==='dev'?devDirectory:prodDirectory)+'/email-feedback-deployment.json',JSON.stringify({...outputs,deployedAt:new Date().toISOString()},null,2));console.log(env+' SES bounce/complaint processing configured with private failed-event queue')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Email feedback deployment failed');process.exitCode=1})
