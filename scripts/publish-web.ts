import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {aws,pause,execute,applyEnvironment} from './dev-aws'
import {account} from '../infra/database/resources'
import {verifyStaticRoutes} from './verify-static-routes'

/** Public build settings per environment. These values ship in the website bundle; no secrets belong here. */
export const webTargets={
  dev:{appId:'dvmmztb0u3m9g',branch:'dev',apiId:'vugf6fpl4k',userPoolId:'us-east-2_ijF1G9yWI',clientId:'nudotcmmbchpmqb9u8jnojk4k',domain:'https://studiostack-dev-423563856930.auth.us-east-2.amazoncognito.com',providers:undefined},
  prod:{appId:'dxs0q7vrz4oko',branch:'main',apiId:'ixzikwz8n5',userPoolId:'us-east-2_cAMh3fPA2',clientId:'4uvfiqgqb48sa340pv12ct0pg3',domain:'https://studiostack-prod-423563856930.auth.us-east-2.amazoncognito.com',providers:''},
} as const
export type WebEnvironment=keyof typeof webTargets

export const webOrigin=(environment:WebEnvironment)=>`https://${webTargets[environment].branch}.${webTargets[environment].appId}.amplifyapp.com`
export function webBuildEnv(environment:WebEnvironment):Record<string,string>{
  const t=webTargets[environment],origin=webOrigin(environment)
  return {NEXT_PUBLIC_COGNITO_USER_POOL_ID:t.userPoolId,NEXT_PUBLIC_COGNITO_APP_CLIENT_ID:t.clientId,NEXT_PUBLIC_COGNITO_DOMAIN:t.domain,
    NEXT_PUBLIC_COGNITO_REDIRECT_URI:origin+'/login/',NEXT_PUBLIC_DATABASE_API_URL:`https://${t.apiId}.execute-api.us-east-2.amazonaws.com`,
    ...(t.providers===undefined?{}:{NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS:t.providers,NEXT_PUBLIC_COGNITO_SAML_PROVIDER:''})}
}

/** Build, publish and byte-verify the static site. Publishing only: no Cognito, API or storage changes. */
async function main(){
  const environment:WebEnvironment|undefined=applyEnvironment()
  if(!environment)throw new Error('Explicit --apply-dev or --apply-prod required')
  if((await aws<{Account:string}>('sts','get-caller-identity')).Account!==account)throw new Error('Unexpected AWS account')
  const t=webTargets[environment],origin=webOrigin(environment)
  const {app}=await aws<{app:{tags?:Record<string,string>;defaultDomain:string}}>('amplify','get-app',['--app-id',t.appId])
  if(app.tags?.ManagedBy!=='StudioStack'||app.tags?.Environment!==environment||origin!==`https://${t.branch}.${app.defaultDomain}`)throw new Error('Unexpected hosting app')
  const build=await execute('npm',['run','build'],{maxBuffer:8*1024*1024,env:{...process.env,...webBuildEnv(environment)}})
  console.log(build.stdout)
  const directory=resolve(`.aws/${environment}-rollout`);await mkdir(directory,{recursive:true})
  const zip=`${directory}/web-${Date.now()}.zip`
  await execute('zip',['-q','-r',zip,'.'],{cwd:resolve('out')})
  const deployment=await aws<{jobId:string;zipUploadUrl:string}>('amplify','create-deployment',['--app-id',t.appId,'--branch-name',t.branch])
  const uploaded=await fetch(deployment.zipUploadUrl,{method:'PUT',body:await readFile(zip),headers:{'Content-Type':'application/zip'}})
  if(!uploaded.ok)throw new Error('Web package upload failed')
  await aws('amplify','start-deployment',['--app-id',t.appId,'--branch-name',t.branch,'--job-id',deployment.jobId])
  console.log(`Publishing ${environment} web, job ${deployment.jobId}`)
  let published=false
  for(let attempt=0;attempt<60&&!published;attempt++){
    const {job}=await aws<{job:{summary:{status:string}}}>('amplify','get-job',['--app-id',t.appId,'--branch-name',t.branch,'--job-id',deployment.jobId])
    if(job.summary.status==='SUCCEED')published=true
    else if(['FAILED','CANCELLED'].includes(job.summary.status))throw new Error('Web publication failed')
    else await pause(5000)
  }
  if(!published)throw new Error('Web publication pending; inspect job '+deployment.jobId)
  const verified=await verifyStaticRoutes(origin)
  const record={environment,appId:t.appId,branch:t.branch,origin,jobId:deployment.jobId,...verified,commit:process.env.GITHUB_SHA,deployedAt:new Date().toISOString()}
  await writeFile(`${directory}/web-deployment.json`,JSON.stringify(record,null,2))
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`### ${environment} web published\n\n${origin} · Amplify job ${deployment.jobId} · ${verified.routes} routes and ${verified.files} files verified\n`)
  console.log(`Verified ${verified.routes} ${environment} routes and ${verified.files} matching HTML/data/assets: ${origin}`)
}
if(process.argv[1]?.endsWith('publish-web.ts'))main().catch(error=>{console.error(error instanceof Error?error.message:'Web publication failed');process.exitCode=1})
