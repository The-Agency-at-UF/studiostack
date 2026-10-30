import {emailConfigurationSet} from './email-configuration'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {accountInfrastructure} from '../infra/production/accounts'
import {devAuthInfrastructure} from '../infra/database/dev-auth'
import {readMetadata} from './deploy-dev-api'
import {aws,applyStack,guardDevApply,devDirectory,invoke} from './dev-aws'
const execute=promisify(execFile)
async function main(){
  await guardDevApply()
  const metadata=await readMetadata(),web=JSON.parse(await readFile(`${devDirectory}/web-deployment.json`,'utf8')) as {origin:string}
  const sender=process.env.PRODUCTION_EMAIL_FROM
  if(!sender)throw new Error('Explicit approved PRODUCTION_EMAIL_FROM is required')
  const identity=await aws<{VerifiedForSendingStatus:boolean}>('sesv2','get-email-identity',['--email-identity',sender])
  if(!identity.VerifiedForSendingStatus)throw new Error('Approved sender must be verified')
  const routes=JSON.parse(await readFile(`${devDirectory}/api-deployment.json`,'utf8')) as {routes:{AuthorizerId:string}}
  const updated=await applyStack('studiostack-dev-auth',devAuthInfrastructure(web.origin))
  if(updated.UserPoolId!==metadata.auth.UserPoolId||updated.AppClientId!==metadata.auth.AppClientId)throw new Error('Authentication resources changed unexpectedly')
  const directory=resolve('.aws/accounts');await mkdir(directory,{recursive:true})
  await execute(resolve('node_modules/.bin/esbuild'),['backend/accounts/worker.ts','--bundle','--platform=node','--target=node24','--format=cjs',`--outfile=${directory}/index.js`])
  const zip=resolve(`${directory}/worker-${Date.now()}.zip`)
  await execute('zip',['-q',zip,'index.js'],{cwd:directory})
  const key=`deployments/accounts/${Date.now()}/worker.zip`
  await aws('s3api','put-object',['--bucket','studio-stack-photos-dev','--key',key,'--body',zip,'--server-side-encryption','AES256'])
  await applyStack('studiostack-dev-accounts',accountInfrastructure({environment:'dev',configurationSet:await emailConfigurationSet('dev'),artifactBucket:'studio-stack-photos-dev',artifactKey:key,pool:metadata.auth.UserPoolId,client:metadata.auth.AppClientId,apiId:'vugf6fpl4k',authorizerId:routes.routes.AuthorizerId,sender,webUrl:web.origin}))
  const result=await invoke<{claimed:number;sent:number;failed:number}>('studiostack-dev-accounts',{})
  await writeFile(`${devDirectory}/account-deployment.json`,JSON.stringify({worker:'studiostack-dev-accounts',sender,webUrl:web.origin,result,deployedAt:new Date().toISOString()},null,2))
  console.log('Development account delivery and verified invitation acceptance deployed')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Account deployment failed');process.exitCode=1})
