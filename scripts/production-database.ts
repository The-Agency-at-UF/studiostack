import {resolve} from 'node:path'
import {infrastructure,executionPolicy,trust,roleArn,subnets} from '../infra/database/resources'
import {aws,applyStack,waitFunction,pause,invoke} from './dev-aws'
import {readMetadata,type DevMetadata} from './deploy-dev-api'
import {productionMetadata,type ProductionMetadata} from './prod-aws'
export async function productionVariables(metadata:ProductionMetadata){
 const shared=await readMetadata(),{DBClusters:[cluster]}=await aws<{DBClusters:{Endpoint:string;DatabaseName:string;Status:string;Engine:string;MasterUserSecret:{SecretArn:string};VpcSecurityGroups:{VpcSecurityGroupId:string}[]}[]}>('rds','describe-db-clusters',['--db-cluster-identifier','studiostack-prod-db'])
 if(cluster.Status!=='available'||cluster.Engine!=='aurora-postgresql'||cluster.DatabaseName!=='studiostackprod'||cluster.VpcSecurityGroups.length!==1||cluster.VpcSecurityGroups[0].VpcSecurityGroupId!=='sg-062d80daa895fb7b6'||cluster.MasterUserSecret.SecretArn!==shared.masterSecrets.prod)throw new Error('Unexpected production database')
 return {STUDIOSTACK_ENV:'prod',RDS_AWS_ACCOUNT_ID:'423563856930',RDS_HOST:cluster.Endpoint,RDS_DATABASE:'studiostackprod',RDS_PORT:'5432',RDS_SECRET_ARN:shared.network.ProdSecretArn,RDS_CA_BUNDLE_PATH:'/var/task/certs/us-east-2-bundle.pem',RDS_CONNECT_TIMEOUT_MS:'18000',DATABASE_API_ID:metadata.apiId,COGNITO_USER_POOL_ID:metadata.auth.UserPoolId,COGNITO_APP_CLIENT_ID:metadata.auth.AppClientId,S3_PHOTOS_BUCKET:'studio-stack-photos-prod'}
}
async function removeProductionMaintenance(){
 const name='studiostack-prod-database-setup',role=name+'-role',{Functions}=await aws<{Functions:{FunctionName:string}[]}>('lambda','list-functions')
 if(Functions.some(f=>f.FunctionName===name)){const {Tags}=await aws<{Tags:Record<string,string>}>('lambda','list-tags',['--resource','arn:aws:lambda:us-east-2:423563856930:function:'+name]);if(Tags.ManagedBy!=='StudioStack'||Tags.Temporary!=='true')throw new Error('Unowned production maintenance function');await aws('lambda','delete-function',['--function-name',name])}
 const {Roles}=await aws<{Roles:{RoleName:string}[]}>('iam','list-roles')
 if(Roles.some(r=>r.RoleName===role)){const {Role}=await aws<{Role:{Tags:{Key:string;Value:string}[]}}>('iam','get-role',['--role-name',role]);if(!Role.Tags.some(t=>t.Key==='Temporary'&&t.Value==='true')||!Role.Tags.some(t=>t.Key==='ManagedBy'&&t.Value==='StudioStack'))throw new Error('Unowned production maintenance role');const p=await aws<{PolicyNames:string[]}>('iam','list-role-policies',['--role-name',role]);for(const policy of p.PolicyNames)await aws('iam','delete-role-policy',['--role-name',role,'--policy-name',policy]);await aws('iam','delete-role',['--role-name',role])}
}
export async function withProductionMaintenance<T>(operation:()=>Promise<T>){
 const shared:DevMetadata=await readMetadata(),metadata=await productionMetadata(),name='studiostack-prod-database-setup'
 const existing=await aws<{Functions:{FunctionName:string}[]}>('lambda','list-functions');if(existing.Functions.some(f=>f.FunctionName===name))throw new Error('Inspect pre-existing production maintenance before proceeding')
 await applyStack('studiostack-database-connections',infrastructure(shared.masterSecrets,['prod'],{prefixListId:shared.prefixListId}))
 try{
  await aws('iam','create-role',['--role-name',name+'-role','--assume-role-policy-document',JSON.stringify(trust),'--tags','Key=ManagedBy,Value=StudioStack','Key=Temporary,Value=true'])
  await aws('iam','put-role-policy',['--role-name',name+'-role','--policy-name','production-temporary-schema','--policy-document',JSON.stringify(executionPolicy(name,[shared.masterSecrets.prod,shared.network.ProdSecretArn]))]);await pause(15000)
  const vars={...await productionVariables(metadata),RDS_SECRET_ARN:shared.masterSecrets.prod,RDS_APP_SECRET_ARN:shared.network.ProdSecretArn,RDS_CONNECT_TIMEOUT_MS:'45000',APPLY_DATABASE_API_SCHEMA:'yes',ALLOW_PRODUCTION_SCHEMA:'yes',ALLOW_PRODUCTION_OWNER_BOOTSTRAP:'yes'}
  await aws('lambda','create-function',['--function-name',name,'--role',roleArn(name+'-role'),'--handler','index.handler','--runtime','nodejs24.x','--architectures','arm64','--timeout','90','--memory-size','256','--environment',JSON.stringify({Variables:vars}),'--vpc-config',JSON.stringify({SubnetIds:subnets,SecurityGroupIds:['sg-0852d29f6cdd33552']}),'--zip-file',`fileb://${resolve('.aws/database-api/setup.zip')}`,'--tags','ManagedBy=StudioStack,Temporary=true']);await waitFunction(name);await pause(45000)
  return await operation()
 }finally{await removeProductionMaintenance();await applyStack('studiostack-database-connections',infrastructure(shared.masterSecrets,false,{prefixListId:shared.prefixListId}));console.log('Temporary production maintenance access removed; runtime cannot read master secrets')}
}
export async function invokeProductionMaintenance<T>(payload:unknown):Promise<T>{for(let attempt=0;;attempt++){try{return await invoke<T>('studiostack-prod-database-setup',payload)}catch(error){if(!(error instanceof Error)||!/\((?:migrations|fixtures|bootstrap)\/secret\/AccessDenied[A-Za-z]+\)/.test(error.message)||attempt>=6)throw error;await pause(20000)}}}
