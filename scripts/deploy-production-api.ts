import {writeFile,readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {aws,applyStack,waitFunction,invoke,pause} from './dev-aws'
import {guardProductionApply,productionMetadata,saveProductionMetadata,prodDirectory,approvedProductionEmail} from './prod-aws'
import {productionVariables,withProductionMaintenance,invokeProductionMaintenance} from './production-database'
import {databaseApiInfrastructure} from '../infra/database/api-resources'
import {roleArn} from '../infra/database/resources'
import {configureProductionCapacity} from './configure-production-capacity'
async function main(){
 await guardProductionApply();const metadata=await productionMetadata(),name='studiostack-prod-database'
 const existing=await aws<{Configuration:{Role:string;Architectures:string[];MemorySize:number;Timeout:number;Environment?:{Variables?:Record<string,string>}};Code:{Location:string}}>('lambda','get-function',['--function-name',name])
 if(existing.Configuration.Role!==roleArn(name+'-role')||existing.Configuration.Architectures[0]!=='arm64')throw new Error('Unexpected production function identity')
 const previous=await fetch(existing.Code.Location);if(!previous.ok)throw new Error('Unable to preserve current production runtime');await writeFile(prodDirectory+'/previous-runtime.zip',Buffer.from(await previous.arrayBuffer()),{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error});await writeFile(prodDirectory+'/previous-runtime-configuration.json',JSON.stringify(existing.Configuration,null,2),{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error})
 const matching=await aws<{Users:{Username:string;Attributes:{Name:string;Value:string}[]}[]}>('cognito-idp','list-users',['--user-pool-id',metadata.auth.UserPoolId,'--filter',`email = "${approvedProductionEmail}"`]);if(matching.Users.length>1)throw new Error('Ambiguous approved owner identity')
 const owner=matching.Users[0]??(await aws<{User:{Username:string;Attributes:{Name:string;Value:string}[]}}>('cognito-idp','admin-create-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',approvedProductionEmail,'--message-action','SUPPRESS','--user-attributes',`Name=email,Value=${approvedProductionEmail}`,'Name=name,Value=Roger McKenzie'])).User
 const attributes=Object.fromEntries(owner.Attributes.map(a=>[a.Name,a.Value]));if(attributes.email!==approvedProductionEmail||!attributes.sub)throw new Error('Owner identity mismatch')
 await withProductionMaintenance(async()=>{const schema=await invokeProductionMaintenance<{ok:boolean;environment:string;applied:string[]}>({});if(!schema.ok||schema.environment!=='prod')throw new Error('Production schema did not verify');console.log('Production migrations applied: '+schema.applied.join(', '));const onboard=await invokeProductionMaintenance<{ok:boolean;organizationId:string;userId:string}>({action:'bootstrap-production-admin',subject:attributes.sub,email:approvedProductionEmail});if(!onboard.ok)throw new Error('Owner setup did not verify');const previousOwner=await readFile(prodDirectory+'/owner.json','utf8').then(v=>JSON.parse(v) as {username:string;invitationSent:boolean}).catch(error=>{if(error.code!=='ENOENT')throw error;return undefined});await writeFile(prodDirectory+'/owner.json',JSON.stringify({...onboard,username:owner.Username,invitationSent:previousOwner?.username===owner.Username&&previousOwner.invitationSent===true},null,2))})
 const vars=await productionVariables(metadata)
 await aws('lambda','update-function-code',['--function-name',name,'--zip-file',`fileb://${resolve('.aws/database-api/runtime.zip')}`]);await waitFunction(name)
 await aws('lambda','update-function-configuration',['--function-name',name,'--memory-size','1024','--timeout','28','--environment',JSON.stringify({Variables:{...existing.Configuration.Environment?.Variables,...vars}})]);await waitFunction(name)
 if(!(await invoke<{ok:boolean}>(name,{})).ok)throw new Error('Restricted production connection failed')
 await deployProductionRoutes(metadata)
}
export async function deployProductionRoutes(metadata:Awaited<ReturnType<typeof productionMetadata>>){
 const vars=await productionVariables(metadata)
 const routes=await applyStack('studiostack-prod-database-api',databaseApiInfrastructure(vars,true));metadata.routes={AuthorizerId:routes.AuthorizerId,IntegrationId:routes.IntegrationId}
 const apiRoutes=await aws<{Items:{RouteKey:string;RouteId:string}[]}>('apigatewayv2','get-routes',['--api-id',metadata.apiId]),upload=apiRoutes.Items.find(r=>r.RouteKey==='POST /photos/uploads');if(!upload)throw new Error('Expected production upload route missing')
 await aws('apigatewayv2','update-route',['--api-id',metadata.apiId,'--route-id',upload.RouteId,'--authorization-type','JWT','--authorizer-id',routes.AuthorizerId,'--authorization-scopes','aws.cognito.signin.user.admin','--target','integrations/'+routes.IntegrationId])
 await aws('apigatewayv2','update-api',['--api-id',metadata.apiId,'--cors-configuration',JSON.stringify({AllowOrigins:[metadata.app.origin],AllowMethods:['GET','POST','PATCH','DELETE','OPTIONS'],AllowHeaders:['Authorization','Content-Type'],MaxAge:300})]);await configureProductionCapacity(metadata)
 const cors=await aws<{CORSRules:Record<string,unknown>[]}>('s3api','get-bucket-cors',['--bucket','studio-stack-photos-prod']).catch(error=>{if(error.code!=='NoSuchCORSConfiguration')throw error;return {CORSRules:[]}});await aws('s3api','put-bucket-cors',['--bucket','studio-stack-photos-prod','--cors-configuration',JSON.stringify({CORSRules:[...cors.CORSRules.filter(r=>r.ID!=='studiostack-production-web'),{ID:'studiostack-production-web',AllowedOrigins:[metadata.app.origin],AllowedMethods:['POST'],AllowedHeaders:['*'],ExposeHeaders:['ETag'],MaxAgeSeconds:300}]})])
 await saveProductionMetadata(metadata)
 for(const path of ['/me','/organizations','/photos/uploads']){await pause(600);const response=await fetch('https://ixzikwz8n5.execute-api.us-east-2.amazonaws.com'+path,{method:path==='/photos/uploads'?'POST':'GET',signal:AbortSignal.timeout(30000)});if(response.status!==401)throw new Error('Production authentication boundary failed')}
 await writeFile(prodDirectory+'/api-verification.json',JSON.stringify({apiId:metadata.apiId,unauthenticatedRequestsRejected:true,verifiedAt:new Date().toISOString()},null,2));console.log('Production schema, owner membership, restricted API and private storage configured; owner email deferred until website publication')
}
if(process.argv[1]?.endsWith('deploy-production-api.ts'))main().catch(error=>{console.error(error instanceof Error?error.message:'Production API deployment failed');process.exitCode=1})
