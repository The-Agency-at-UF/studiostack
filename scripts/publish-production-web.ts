import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {aws,pause} from './dev-aws'
import {guardProductionApply,productionMetadata,prodDirectory} from './prod-aws'
import {verifyStaticRoutes} from './verify-static-routes'
const execute=promisify(execFile)

async function main() {
  await guardProductionApply()
  const metadata=await productionMetadata(),{app}=await aws<{app:{tags:Record<string,string>;defaultDomain:string}}>('amplify','get-app',['--app-id',metadata.app.appId])
  if(app.tags.ManagedBy!=='StudioStack'||app.tags.Environment!=='prod'||metadata.app.origin!==`https://${metadata.app.branch}.${app.defaultDomain}`)throw new Error('Unexpected production hosting app')
  const build=await execute('npm',['run','build'],{maxBuffer:4*1024*1024,env:{...process.env,
    NEXT_PUBLIC_COGNITO_USER_POOL_ID:metadata.auth.UserPoolId,NEXT_PUBLIC_COGNITO_APP_CLIENT_ID:metadata.auth.AppClientId,
    NEXT_PUBLIC_COGNITO_DOMAIN:metadata.auth.Domain,NEXT_PUBLIC_COGNITO_REDIRECT_URI:metadata.app.origin+'/login/',
    NEXT_PUBLIC_DATABASE_API_URL:'https://ixzikwz8n5.execute-api.us-east-2.amazonaws.com',NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS:'',NEXT_PUBLIC_COGNITO_SAML_PROVIDER:'',
  }})
  console.log(build.stdout)
  const zip=resolve(prodDirectory+`/web-${Date.now()}.zip`)
  await execute('zip',['-q','-r',zip,'.'],{cwd:resolve('out')})
  const deployment=await aws<{jobId:string;zipUploadUrl:string}>('amplify','create-deployment',['--app-id',metadata.app.appId,'--branch-name',metadata.app.branch])
  const uploaded=await fetch(deployment.zipUploadUrl,{method:'PUT',body:await readFile(zip),headers:{'Content-Type':'application/zip'}})
  if(!uploaded.ok)throw new Error('Production web upload failed')
  await aws('amplify','start-deployment',['--app-id',metadata.app.appId,'--branch-name',metadata.app.branch,'--job-id',deployment.jobId])
  console.log('Publishing production web, job '+deployment.jobId)
  let published=false
  for(let attempt=0;attempt<60;attempt++) {
    const {job}=await aws<{job:{summary:{status:string}}}>('amplify','get-job',['--app-id',metadata.app.appId,'--branch-name',metadata.app.branch,'--job-id',deployment.jobId])
    if(job.summary.status==='SUCCEED'){published=true;break}
    if(['FAILED','CANCELLED'].includes(job.summary.status))throw new Error('Production web publication failed')
    await pause(5000)
  }
  if(!published)throw new Error('Production publication pending; inspect job '+deployment.jobId)
  const verified=await verifyStaticRoutes(metadata.app.origin)
  await writeFile(prodDirectory+'/web-deployment.json',JSON.stringify({...metadata.app,jobId:deployment.jobId,...verified,deployedAt:new Date().toISOString()},null,2))
  console.log(`Verified ${verified.routes} production routes and ${verified.files} matching HTML/data/assets: ${metadata.app.origin}`)
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production web publication failed');process.exitCode=1})
