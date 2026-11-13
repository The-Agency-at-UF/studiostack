import {readFile,writeFile} from 'node:fs/promises'
import {prodDirectory} from './prod-aws'
import {rdsInstanceId} from '../infra/database/rds-instance'

/** Written by deploy-rds-instance.ts; `cutoverAt` is added once production runs on the instance. */
export interface ProductionRds {InstanceId:string;Endpoint:string;ResourceId:string;MasterSecretArn:string;createdAt:string;cutoverAt?:string}
const file=()=>prodDirectory+'/rds-instance.json'

export async function productionRds():Promise<ProductionRds|undefined>{
 let value:ProductionRds
 try{value=JSON.parse(await readFile(file(),'utf8'))}catch(error){if((error as {code?:string}).code==='ENOENT')return undefined;throw error}
 if(value.InstanceId!==rdsInstanceId('prod')||!/^studiostack-prod-pg\.[a-z0-9]+\.us-east-2\.rds\.amazonaws\.com$/.test(value.Endpoint)||!/^db-[A-Z0-9]+$/.test(value.ResourceId)||!value.MasterSecretArn.startsWith('arn:aws:secretsmanager:us-east-2:423563856930:secret:rds!db-'))throw new Error('Unexpected production RDS record')
 return value
}
export async function recordProductionCutover(value:ProductionRds,cutoverAt:string|undefined){await writeFile(file(),JSON.stringify({...value,cutoverAt},null,2))}
