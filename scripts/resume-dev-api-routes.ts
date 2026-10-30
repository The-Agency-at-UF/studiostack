import {guardDevApply} from './dev-aws'
import {deployDevRoutes,readMetadata} from './deploy-dev-api'
async function main(){await guardDevApply();await deployDevRoutes(await readMetadata())}
main().catch(error=>{console.error(error instanceof Error?error.message:'Dev route deployment failed');process.exitCode=1})
