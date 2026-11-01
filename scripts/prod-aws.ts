import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {aws} from './dev-aws'
import {account} from '../infra/database/resources'
import {userPoolPattern} from '../src/types/patterns'
export const prodDirectory=resolve('.aws/prod-rollout')
export const approvedProductionEmail='rmckenzie1@ufl.edu'
export interface ProductionMetadata {auth:Record<string,string>;app:{appId:string;branch:string;origin:string};apiId:'ixzikwz8n5';routes?:{AuthorizerId:string;IntegrationId:string}}
export async function guardProductionApply(){if(process.argv.slice(2).join(' ')!=='--apply-prod')throw new Error('Explicit approved --apply-prod required');if((await aws<{Account:string}>('sts','get-caller-identity')).Account!==account)throw new Error('Unexpected production AWS account');await mkdir(prodDirectory,{recursive:true})}
export async function productionMetadata():Promise<ProductionMetadata>{const value=JSON.parse(await readFile(prodDirectory+'/metadata.json','utf8')) as ProductionMetadata;if(value.apiId!=='ixzikwz8n5'||!userPoolPattern.test(value.auth.UserPoolId)||!value.auth.AppClientId||new URL(value.app.origin).protocol!=='https:')throw new Error('Explicit production metadata required');return value}
export async function saveProductionMetadata(value:ProductionMetadata){await writeFile(prodDirectory+'/metadata.json',JSON.stringify(value,null,2))}
