import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { aws, guardDevApply, devDirectory, pause } from './dev-aws'
import { readMetadata } from './deploy-dev-api'
const execute = promisify(execFile)
async function main() {
  await guardDevApply()
  const metadata = await readMetadata(), name = 'studiostack-development'
  const { apps } = await aws<{apps:{appId:string;name:string;defaultDomain:string}[]}>('amplify','list-apps')
  const existing = apps.filter(a=>a.name===name)
  if (existing.length > 1) throw new Error('More than one development hosting app matches; choose explicitly')
  let app = existing[0]
  if (!app) app = (await aws<{app:typeof app}>('amplify','create-app',['--name',name,'--platform','WEB','--tags','ManagedBy=StudioStack,Environment=dev'])).app
  const details = await aws<{app:{tags?:Record<string,string>}}>('amplify','get-app',['--app-id',app.appId])
  if (details.app.tags?.ManagedBy !== 'StudioStack' || details.app.tags?.Environment !== 'dev') throw new Error('Hosting app is not a managed development app')
  const branch = 'dev', origin = `https://${branch}.${app.defaultDomain}`
  const { branches } = await aws<{branches:{branchName:string}[]}>('amplify','list-branches',['--app-id',app.appId])
  if (!branches.some(b=>b.branchName===branch)) await aws('amplify','create-branch',['--app-id',app.appId,'--branch-name',branch,'--stage','DEVELOPMENT','--no-enable-auto-build'])
  const auth = await aws<{UserPoolClient:Record<string,unknown>}>('cognito-idp','describe-user-pool-client',['--user-pool-id',metadata.auth.UserPoolId,'--client-id',metadata.auth.AppClientId])
  // Updating a Cognito client resets omitted mutable properties; carry the
  // complete supported configuration forward and add only the exact dev URLs.
  const c = auth.UserPoolClient
  const supported = ['UserPoolId','ClientId','ClientName','RefreshTokenValidity','AccessTokenValidity','IdTokenValidity','TokenValidityUnits','ReadAttributes','WriteAttributes','ExplicitAuthFlows','SupportedIdentityProviders','AllowedOAuthFlows','AllowedOAuthScopes','AllowedOAuthFlowsUserPoolClient','AnalyticsConfiguration','PreventUserExistenceErrors','EnableTokenRevocation','EnablePropagateAdditionalUserContextData','AuthSessionValidity','RefreshTokenRotation','LogoutURLs','CallbackURLs','DefaultRedirectURI']
  const update = Object.fromEntries(supported.filter(k=>c[k]!==undefined).map(k=>[k,c[k]]))
  update.CallbackURLs = [...new Set([...(c.CallbackURLs as string[] ?? []),`${origin}/login/`])]
  update.LogoutURLs = [...new Set([...(c.LogoutURLs as string[] ?? []),`${origin}/`])]
  const clientFile = `${devDirectory}/web-cognito-client.json`; await writeFile(clientFile,JSON.stringify(update))
  await aws('cognito-idp','update-user-pool-client',['--cli-input-json',`file://${clientFile}`])
  const api = await aws<{CorsConfiguration:{AllowOrigins?:string[];AllowMethods?:string[];AllowHeaders?:string[];MaxAge?:number}}>('apigatewayv2','get-api',['--api-id','vugf6fpl4k'])
  const cors = {...api.CorsConfiguration,AllowOrigins:[...new Set([...(api.CorsConfiguration.AllowOrigins??[]),origin])],AllowMethods:[...new Set([...(api.CorsConfiguration.AllowMethods??[]),'GET','POST','PATCH','DELETE','OPTIONS'])],AllowHeaders:['Authorization','Content-Type'],MaxAge:300}
  await aws('apigatewayv2','update-api',['--api-id','vugf6fpl4k','--cors-configuration',JSON.stringify(cors)])
  const {CORSRules} = await aws<{CORSRules:(Record<string,unknown> & {AllowedOrigins?:string[]})[]}>('s3api','get-bucket-cors',['--bucket','studio-stack-photos-dev'])
  const rules = CORSRules.filter(r=>r.ID!=='studiostack-production-web')
  rules.push({ID:'studiostack-production-web',AllowedOrigins:[origin],AllowedMethods:['POST'],AllowedHeaders:['*'],ExposeHeaders:['ETag'],MaxAgeSeconds:300})
  await aws('s3api','put-bucket-cors',['--bucket','studio-stack-photos-dev','--cors-configuration',JSON.stringify({CORSRules:rules})])
  const env = {...process.env,NEXT_PUBLIC_COGNITO_USER_POOL_ID:metadata.auth.UserPoolId,NEXT_PUBLIC_COGNITO_APP_CLIENT_ID:metadata.auth.AppClientId,NEXT_PUBLIC_COGNITO_DOMAIN:metadata.auth.Domain,NEXT_PUBLIC_COGNITO_REDIRECT_URI:`${origin}/login/`,NEXT_PUBLIC_DATABASE_API_URL:'https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com'}
  const built = await execute('npm',['run','build'],{env,maxBuffer:4*1024*1024}); console.log(built.stdout)
  const zip = resolve(`${devDirectory}/web.zip`); await rm(zip,{force:true});await execute('zip',['-q','-r',zip,'.'],{cwd:resolve('out')})
  const deployment = await aws<{jobId:string;zipUploadUrl:string}>('amplify','create-deployment',['--app-id',app.appId,'--branch-name',branch])
  const upload = await fetch(deployment.zipUploadUrl,{method:'PUT',body:await readFile(zip),headers:{'Content-Type':'application/zip'}})
  if (!upload.ok) throw new Error('Development web package upload failed')
  await aws('amplify','start-deployment',['--app-id',app.appId,'--branch-name',branch,'--job-id',deployment.jobId])
  for (let attempt=0;attempt<60;attempt++) {
    const {job} = await aws<{job:{summary:{status:string}}}>('amplify','get-job',['--app-id',app.appId,'--branch-name',branch,'--job-id',deployment.jobId])
    if (job.summary.status==='SUCCEED') {await writeFile(`${devDirectory}/web-deployment.json`,JSON.stringify({appId:app.appId,branch,origin,jobId:deployment.jobId,deployedAt:new Date().toISOString()},null,2));console.log(`Development website deployed: ${origin}/production/`);return}
    if (['FAILED','CANCELLED'].includes(job.summary.status)) throw new Error('Development website deployment did not succeed')
    await pause(5000)
  }
  throw new Error('Development website deployment is still pending; inspect the saved job')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Development website deployment failed');process.exitCode=1})
