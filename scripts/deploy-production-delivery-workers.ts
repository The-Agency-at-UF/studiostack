import {guardProductionApply,productionMetadata} from './prod-aws'
import {deployProductionDeliveryWorkers} from './deploy-production-application'
async function main(){await guardProductionApply();await deployProductionDeliveryWorkers(await productionMetadata())}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production worker release failed');process.exitCode=1})
