import {resolve} from 'node:path'
import {writeFile} from 'node:fs/promises'
import {aws,guardDevApply,devDirectory,waitFunction,invoke} from './dev-aws'
import {guardProductionApply,productionMetadata,prodDirectory,approvedProductionEmail} from './prod-aws'
import {readMetadata,withMaintenance,invokeMaintenance,deployDevRoutes} from './deploy-dev-api'
import {withProductionMaintenance,invokeProductionMaintenance} from './production-database'
import {deployProductionRoutes} from './deploy-production-api'
import {roleArn} from '../infra/database/resources'
async function main(){
 const env=process.argv.slice(2).join(' ')==='--apply-dev'?'dev':process.argv.slice(2).join(' ')==='--apply-prod'?'prod':undefined;if(!env)throw new Error('Explicit environment required')
 if(env==='dev')await guardDevApply();else await guardProductionApply()
 const metadata=env==='dev'?await readMetadata():await productionMetadata(),shared=await readMetadata(),pool=metadata.auth.UserPoolId,name=`studiostack-${env}-database`
 const {Users}=await aws<{Users:{Attributes:{Name:string;Value:string}[]}[]}>('cognito-idp','list-users',['--user-pool-id',pool,'--filter',`email = "${approvedProductionEmail}"`]);if(Users.length!==1)throw new Error('Existing approved owner account required')
 const attributes=Object.fromEntries(Users[0].Attributes.map(a=>[a.Name,a.Value]));if(attributes.email!==approvedProductionEmail||!attributes.sub)throw new Error('Owner identity differs')
 let result:unknown
 const setup=async()=>{const run=env==='dev'?invokeMaintenance:invokeProductionMaintenance;const schema=await run<{ok:boolean}>({});if(!schema.ok)throw new Error('Schema setup failed');result=await run({action:'bootstrap-production-admin',subject:attributes.sub,email:approvedProductionEmail})}
 if(env==='dev')await withMaintenance(shared,'20261029-00000000',setup);else await withProductionMaintenance(setup)
 const current=await aws<{Role:string}>('lambda','get-function-configuration',['--function-name',name]);if(current.Role!==roleArn(name+'-role'))throw new Error('Unexpected runtime role')
 await aws('lambda','update-function-code',['--function-name',name,'--zip-file',`fileb://${resolve('.aws/database-api/runtime.zip')}`]);await waitFunction(name)
 if(!(await invoke<{ok:boolean}>(name,{})).ok)throw new Error('Restricted runtime check failed')
 if(env==='dev')await deployDevRoutes(shared);else await deployProductionRoutes(await productionMetadata())
 await writeFile((env==='dev'?devDirectory:prodDirectory)+'/agency-workspace.json',JSON.stringify({environment:env,result,verifiedAt:new Date().toISOString()},null,2))
 console.log(env+' Agency workspace, production assignments and client APIs verified')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Agency deployment failed');process.exitCode=1})
