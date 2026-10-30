import {emailConfigurationSet} from './email-configuration'
import {sendProductionOwnerInvitation} from './send-production-owner-invitation'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {aws,applyStack,pause,waitFunction} from './dev-aws'
import {guardProductionApply,productionMetadata,prodDirectory,approvedProductionEmail} from './prod-aws'
import {accountInfrastructure} from '../infra/production/accounts'
import {productionNotificationInfrastructure} from '../infra/production/notifications'
import {productionAuthInfrastructure} from '../infra/production/auth'
import {verifyStaticRoutes} from './verify-static-routes'
const execute=promisify(execFile)
async function main(){
 await guardProductionApply();const metadata=await productionMetadata(),routes=metadata.routes;if(!routes)throw new Error('Production API must be verified first')
 const {app}=await aws<{app:{tags:Record<string,string>;defaultDomain:string}}>('amplify','get-app',['--app-id',metadata.app.appId]);if(app.tags.ManagedBy!=='StudioStack'||app.tags.Environment!=='prod'||metadata.app.origin!==`https://${metadata.app.branch}.${app.defaultDomain}`)throw new Error('Unexpected production hosting app')
 await deployProductionDeliveryWorkers(metadata)
 const build=await execute('npm',['run','build'],{env:{...process.env,NEXT_PUBLIC_COGNITO_USER_POOL_ID:metadata.auth.UserPoolId,NEXT_PUBLIC_COGNITO_APP_CLIENT_ID:metadata.auth.AppClientId,NEXT_PUBLIC_COGNITO_DOMAIN:metadata.auth.Domain,NEXT_PUBLIC_COGNITO_REDIRECT_URI:metadata.app.origin+'/login/',NEXT_PUBLIC_DATABASE_API_URL:'https://ixzikwz8n5.execute-api.us-east-2.amazonaws.com',NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS:'',NEXT_PUBLIC_COGNITO_SAML_PROVIDER:''},maxBuffer:4*1024*1024});console.log(build.stdout)
 const zip=resolve(prodDirectory+`/web-${Date.now()}.zip`);await execute('zip',['-q','-r',zip,'.'],{cwd:resolve('out')});const deployment=await aws<{jobId:string;zipUploadUrl:string}>('amplify','create-deployment',['--app-id',metadata.app.appId,'--branch-name',metadata.app.branch]);const upload=await fetch(deployment.zipUploadUrl,{method:'PUT',body:await readFile(zip),headers:{'Content-Type':'application/zip'}});if(!upload.ok)throw new Error('Production web upload failed');await aws('amplify','start-deployment',['--app-id',metadata.app.appId,'--branch-name',metadata.app.branch,'--job-id',deployment.jobId])
 let published=false;for(let attempt=0;attempt<60;attempt++){const {job}=await aws<{job:{summary:{status:string}}}>('amplify','get-job',['--app-id',metadata.app.appId,'--branch-name',metadata.app.branch,'--job-id',deployment.jobId]);if(job.summary.status==='SUCCEED'){published=true;break}if(['FAILED','CANCELLED'].includes(job.summary.status))throw new Error('Production web publication failed');await pause(5000)}if(!published)throw new Error('Production publication pending; inspect Amplify job '+deployment.jobId)
 const response=await fetch(metadata.app.origin+'/login/',{signal:AbortSignal.timeout(30000)});if(!response.ok||!(await response.text()).includes('StudioStack'))throw new Error('Production website verification failed')
 await verifyStaticRoutes(metadata.app.origin)
 await writeFile(prodDirectory+'/web-deployment.json',JSON.stringify({...metadata.app,jobId:deployment.jobId,deployedAt:new Date().toISOString()},null,2))
 const updated=await applyStack('studiostack-prod-auth',productionAuthInfrastructure(metadata.app.origin));if(updated.UserPoolId!==metadata.auth.UserPoolId||updated.AppClientId!==metadata.auth.AppClientId)throw new Error('Production authentication identity changed')
 await sendProductionOwnerInvitation(metadata)
 console.log('Production application published: '+metadata.app.origin)
}
export async function deployProductionDeliveryWorkers(metadata:Awaited<ReturnType<typeof productionMetadata>>){
 const routes=metadata.routes;if(!routes)throw new Error('Production API must be verified first')
 const sender=approvedProductionEmail,verified=await aws<{VerifiedForSendingStatus:boolean}>('sesv2','get-email-identity',['--email-identity',sender]);if(!verified.VerifiedForSendingStatus)throw new Error('Approved production sender is not verified')
 for(const [kind,entry] of [['accounts','backend/accounts/worker.ts'],['production','backend/production/notifications.ts']]){
  const dir=resolve(prodDirectory+'/'+kind);await mkdir(dir,{recursive:true});await execute(resolve('node_modules/.bin/esbuild'),[entry,'--bundle','--platform=node','--target=node24','--format=cjs',`--outfile=${dir}/index.js`]);const archive=resolve(dir+`/worker-${Date.now()}.zip`);await execute('zip',['-q',archive,'index.js'],{cwd:dir});const key=`deployments/${kind}/${Date.now()}/worker.zip`;await aws('s3api','put-object',['--bucket','studio-stack-photos-prod','--key',key,'--body',archive,'--server-side-encryption','AES256'])
  const template=kind==='accounts'?accountInfrastructure({environment:'prod',configurationSet:await emailConfigurationSet('prod'),artifactBucket:'studio-stack-photos-prod',artifactKey:key,pool:metadata.auth.UserPoolId,client:metadata.auth.AppClientId,apiId:metadata.apiId,authorizerId:routes.AuthorizerId,sender,webUrl:metadata.app.origin}):productionNotificationInfrastructure({environment:'prod',configurationSet:await emailConfigurationSet('prod'),artifactBucket:'studio-stack-photos-prod',artifactKey:key,sender,identity:sender,webUrl:metadata.app.origin,userPoolId:metadata.auth.UserPoolId,enabled:true})
  await applyStack(kind==='accounts'?'studiostack-prod-accounts':'studiostack-prod-production-notifications',template)
 }
 const fn=await aws<{Environment:{Variables:Record<string,string>}}>('lambda','get-function-configuration',['--function-name','studiostack-prod-database']);await aws('lambda','update-function-configuration',['--function-name','studiostack-prod-database','--environment',JSON.stringify({Variables:{...fn.Environment.Variables,PRODUCTION_EMAIL_ENABLED:'yes'}})]);await waitFunction('studiostack-prod-database')

}

if(process.argv[1]?.endsWith('deploy-production-application.ts'))main().catch(error=>{console.error(error instanceof Error?error.message:'Production application release failed');process.exitCode=1})
