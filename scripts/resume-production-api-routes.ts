import {guardProductionApply,productionMetadata} from './prod-aws'
import {deployProductionRoutes} from './deploy-production-api'
async function main(){await guardProductionApply();await deployProductionRoutes(await productionMetadata())}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production route resume failed');process.exitCode=1})
