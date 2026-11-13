import {writeFile} from 'node:fs/promises'
import {rdsInstanceInfrastructure,rdsInstanceId} from '../infra/database/rds-instance'
import {aws,applyStack} from './dev-aws'
import {guardProductionApply,prodDirectory} from './prod-aws'

/**
 * Creates the production RDS for PostgreSQL instance (db.t4g.micro, billed
 * hourly from creation, about $14/month). Dry run by default: it prints the
 * planned resources and touches no AWS account. The app keeps using Aurora
 * until the separate cutover moves data and switches RDS_HOST/RDS_AUTH.
 */
async function main(){
 const template=rdsInstanceInfrastructure('prod'),id=rdsInstanceId('prod')
 if(!process.argv.includes('--apply-prod')){
  const database=template.Resources.Database.Properties
  console.log(`Dry run: would create ${id} (${database.DBInstanceClass}, ${database.Engine} ${database.EngineVersion}, ${database.AllocatedStorage} GB ${database.StorageType}, ${database.BackupRetentionPeriod}-day backups, IAM login) in stack studiostack-prod-rds:`)
  for(const [name,resource] of Object.entries(template.Resources))console.log(`  ${name}: ${resource.Type}`)
  console.log('Re-run with --apply-prod to create it. Nothing was changed.')
  return
 }
 await guardProductionApply()
 // The login policy attaches to the existing runtime role; refuse to create a database it cannot use.
 await aws('iam','get-role',['--role-name','studiostack-prod-database-role'])
 const outputs=await applyStack('studiostack-prod-rds',template,480)
 if(outputs.InstanceId!==id||!/^db-[A-Z0-9]+$/.test(outputs.ResourceId??''))throw new Error('Unexpected RDS instance outputs')
 await writeFile(prodDirectory+'/rds-instance.json',JSON.stringify({...outputs,createdAt:new Date().toISOString()},null,2))
 console.log(`${id} ready at ${outputs.Endpoint}. The app still uses Aurora; run the cutover to move data and switch RDS_HOST.`)
}
main().catch(error=>{console.error(error instanceof Error?error.message:'RDS instance deployment failed');process.exitCode=1})
