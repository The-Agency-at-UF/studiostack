import {writeFile} from 'node:fs/promises'
import {aws} from './dev-aws'
import {guardProductionApply,productionMetadata,prodDirectory} from './prod-aws'
import {productionCapacity,assertProductionCapacity} from '../infra/production/capacity'
import {roleArn} from '../infra/database/resources'

export async function configureProductionCapacity(metadata:Awaited<ReturnType<typeof productionMetadata>>) {
  const name='studiostack-prod-database'
  const [quota,runtime,previousStage,previousConcurrency]=await Promise.all([
    aws<{AccountLimit:{ConcurrentExecutions:number}}>('lambda','get-account-settings'),
    aws<{Role:string;State:string}>('lambda','get-function-configuration',['--function-name',name]),
    aws<{DefaultRouteSettings?:Record<string,unknown>}>('apigatewayv2','get-stage',['--api-id',metadata.apiId,'--stage-name','$default']),
    aws<{ReservedConcurrentExecutions?:number}>('lambda','get-function-concurrency',['--function-name',name]),
  ])
  assertProductionCapacity(quota.AccountLimit.ConcurrentExecutions)
  if(runtime.Role!==roleArn(name+'-role')||runtime.State!=='Active')throw new Error('Unexpected production database runtime')
  await writeFile(prodDirectory+`/capacity-before-${Date.now()}.json`,JSON.stringify({apiId:metadata.apiId,stage:previousStage.DefaultRouteSettings,concurrency:previousConcurrency},null,2))
  // Bound downstream connections before admitting the larger request burst.
  await aws('lambda','put-function-concurrency',['--function-name',name,'--reserved-concurrent-executions',String(productionCapacity.reservedConcurrency)])
  await aws('apigatewayv2','update-stage',['--api-id',metadata.apiId,'--stage-name','$default','--default-route-settings',JSON.stringify({...previousStage.DefaultRouteSettings,...productionCapacity.routeSettings})])
  const [stage,concurrency]=await Promise.all([
    aws<{DefaultRouteSettings:{ThrottlingRateLimit:number;ThrottlingBurstLimit:number}}>('apigatewayv2','get-stage',['--api-id',metadata.apiId,'--stage-name','$default']),
    aws<{ReservedConcurrentExecutions:number}>('lambda','get-function-concurrency',['--function-name',name]),
  ])
  if(concurrency.ReservedConcurrentExecutions!==productionCapacity.reservedConcurrency||stage.DefaultRouteSettings.ThrottlingRateLimit!==productionCapacity.routeSettings.ThrottlingRateLimit||stage.DefaultRouteSettings.ThrottlingBurstLimit!==productionCapacity.routeSettings.ThrottlingBurstLimit)throw new Error('Production capacity readback failed')
  console.log('Verified production capacity: four database executions, API 10 requests/second, burst 12')
}
if(process.argv[1]?.endsWith('configure-production-capacity.ts')) {
  (async()=>{await guardProductionApply();await configureProductionCapacity(await productionMetadata())})().catch(error=>{console.error(error instanceof Error?error.message:'Production capacity configuration failed');process.exitCode=1})
}
