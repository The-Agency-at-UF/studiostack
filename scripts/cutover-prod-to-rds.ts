import {writeFile} from 'node:fs/promises'
import {aws,waitFunction,invoke,pause} from './dev-aws'
import {guardProductionApply,prodDirectory} from './prod-aws'
import {productionRds,recordProductionCutover} from './prod-rds'
import {withProductionMaintenance,invokeProductionMaintenance} from './production-database'
import {productionCapacity} from '../infra/production/capacity'

/**
 * Moves production from Aurora to the RDS instance created by
 * deploy-rds-instance.ts. Dry run by default. With --apply-prod it:
 *  1. snapshots Aurora,
 *  2. freezes writes (runtime concurrency 0, scheduled sweeps disabled),
 *  3. creates the IAM-only app login, schema and grants on RDS, copies every
 *     row in one transaction and compares per-table counts and hashes,
 *  4. points the runtime at RDS with IAM login and checks it answers,
 *  5. unfreezes.
 * Any failure before step 4 completes leaves the runtime on Aurora, unchanged.
 * Aurora itself is never modified, so it stays available for rollback.
 */
const runtime='studiostack-prod-database'
const rules=['studiostack-prod-accounts-recovery','studiostack-prod-production-notifications-schedule','studiostack-prod-database-retention']
type FunctionConfig={Environment:{Variables:Record<string,string>}}

async function main(){
 if(!process.argv.includes('--apply-prod')){
  console.log('Dry run. With --apply-prod this snapshots Aurora, freezes production writes (database runtime concurrency 0; sweeps and retention disabled),')
  console.log('copies all application data to studiostack-prod-pg and verifies counts and hashes, switches the runtime to RDS with IAM login, then unfreezes.')
  console.log('Expect a 10-20 minute write freeze. Nothing was changed.')
  return
 }
 await guardProductionApply()
 const rds=await productionRds()
 if(!rds)throw new Error('Create the RDS instance first: scripts/deploy-rds-instance.ts --apply-prod')
 if(rds.cutoverAt)throw new Error(`Production already moved to RDS at ${rds.cutoverAt}`)
 const started=new Date().toISOString(),evidence:Record<string,unknown>={started,target:rds.InstanceId}
 const snapshot=`studiostack-prod-db-pre-rds-${started.replace(/[^0-9]/g,'').slice(0,14)}`
 await aws('rds','create-db-cluster-snapshot',['--db-cluster-identifier','studiostack-prod-db','--db-cluster-snapshot-identifier',snapshot,'--tags','Key=ManagedBy,Value=StudioStack'])
 for(let i=0;;i++){const {DBClusterSnapshots:[s]}=await aws<{DBClusterSnapshots:{Status:string}[]}>('rds','describe-db-cluster-snapshots',['--db-cluster-snapshot-identifier',snapshot]);if(s.Status==='available')break;if(i>=120)throw new Error('Aurora snapshot did not complete; nothing else changed');await pause(10000)}
 evidence.snapshot=snapshot;console.log(`Aurora snapshot ${snapshot} available`)

 const before=(await aws<FunctionConfig>('lambda','get-function-configuration',['--function-name',runtime])).Environment.Variables
 const ruleStates=Object.fromEntries(await Promise.all(rules.map(async name=>[name,(await aws<{State:string}>('events','describe-rule',['--name',name])).State])))
 let switched=false
 try{
  console.log('Freezing production writes');await aws('lambda','put-function-concurrency',['--function-name',runtime,'--reserved-concurrent-executions','0'])
  for(const name of rules)if(ruleStates[name]==='ENABLED')await aws('events','disable-rule',['--name',name])
  await pause(30000)// let in-flight requests finish before reading the source
  await withProductionMaintenance(async()=>{
   evidence.prepare=await invokeProductionMaintenance({action:'rds-prepare'},300)
   evidence.copy=await invokeProductionMaintenance({action:'rds-copy'},900)
   const verify=await invokeProductionMaintenance<{ok:boolean;differences:unknown;rows:Record<string,number>}>({action:'rds-verify'},900)
   evidence.verify=verify
   if(!verify.ok)throw new Error('Copied data does not match Aurora; runtime left on Aurora')
  },{timeout:900,cutoverTarget:{host:rds.Endpoint,masterSecretArn:rds.MasterSecretArn}})
  const {RDS_SECRET_ARN:_secret,...rest}=before;void _secret
  const after={...rest,RDS_HOST:rds.Endpoint,RDS_AUTH:'iam',RDS_IAM_USER:'studiostack_prod_app'}
  await aws('lambda','update-function-configuration',['--function-name',runtime,'--environment',JSON.stringify({Variables:after})]);await waitFunction(runtime);switched=true
  await aws('lambda','put-function-concurrency',['--function-name',runtime,'--reserved-concurrent-executions',String(productionCapacity.reservedConcurrency)])
  const check=await invoke<{ok?:boolean}>(runtime,{});if(check.ok!==true)throw new Error('Runtime did not answer from RDS')
  await recordProductionCutover(rds,new Date().toISOString());console.log('Production runtime now uses RDS with IAM login')
 }catch(error){
  if(switched){console.error('RDS check failed after the switch; restoring the Aurora configuration');await aws('lambda','update-function-configuration',['--function-name',runtime,'--environment',JSON.stringify({Variables:before})]);await waitFunction(runtime)}
  throw error
 }finally{
  await aws('lambda','put-function-concurrency',['--function-name',runtime,'--reserved-concurrent-executions',String(productionCapacity.reservedConcurrency)])
  for(const name of rules)if(ruleStates[name]==='ENABLED')await aws('events','enable-rule',['--name',name])
  evidence.completed=new Date().toISOString();evidence.switched=switched
  await writeFile(prodDirectory+'/rds-cutover.json',JSON.stringify(evidence,null,2));console.log('Production writes unfrozen')
 }
 console.log('Keep studiostack-prod-db running for 7 days for rollback, then stop it; delete it only after reviewing the snapshot. Run configure-operational-readiness.ts --apply-prod to add the RDS alarms.')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'RDS cutover failed');process.exitCode=1})
