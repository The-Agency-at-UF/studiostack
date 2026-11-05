import { writeFile } from 'node:fs/promises'
import { aws, invoke, waitFunction } from './dev-aws'
import { guardProductionApply, productionMetadata, prodDirectory } from './prod-aws'
import { withProductionMaintenance, invokeProductionMaintenance } from './production-database'
import { deployProductionRoutes } from './deploy-production-api'
import { selectedBuild, sourceState } from './database-build'
import { roleArn } from '../infra/database/resources'
import { databaseApiScope } from '../backend/database/api'

/** Deploy the existing brief deletion feature without bootstrapping accounts. */
async function main() {
  await guardProductionApply()
  const build = await selectedBuild('prod'), metadata = await productionMetadata()
  const name = 'studiostack-prod-database'
  const current = await aws<{ Configuration: { Role: string; Architectures: string[]; CodeSha256: string }; Code: { Location: string } }>('lambda', 'get-function', ['--function-name', name])
  if (current.Configuration.Role !== roleArn(name + '-role') || current.Configuration.Architectures[0] !== 'arm64') throw new Error('Unexpected production runtime identity')
  const previous = await fetch(current.Code.Location)
  if (!previous.ok) throw new Error('Unable to preserve production runtime')
  const backup = `${prodDirectory}/brief-deletion-runtime-${Date.now()}.zip`
  await writeFile(backup, Buffer.from(await previous.arrayBuffer()), { flag: 'wx' })
  await withProductionMaintenance(async () => {
    const schema = await invokeProductionMaintenance<{ ok: boolean; environment: string; applied: string[] }>({})
    if (!schema.ok || schema.environment !== 'prod') throw new Error('Production schema verification failed')
    console.log('Production migrations applied: ' + schema.applied.join(', '))
  })
  await aws('lambda', 'update-function-code', ['--function-name', name, '--zip-file', `fileb://${build.runtime}`])
  await waitFunction(name)
  if (!(await invoke<{ ok: boolean }>(name, {})).ok) throw new Error('Restricted production database connection failed')
  await deployProductionRoutes(metadata)
  const route = 'DELETE /organizations/{organizationId}/production/briefs/{briefId}'
  const { Items } = await aws<{ Items: { RouteKey: string; AuthorizationType: string; AuthorizationScopes?: string[] }[] }>('apigatewayv2', 'get-routes', ['--api-id', metadata.apiId])
  if (!Items.some(r => r.RouteKey === route && r.AuthorizationType === 'JWT' && r.AuthorizationScopes?.includes(databaseApiScope))) throw new Error('Protected brief deletion route missing')
  await writeFile(`${prodDirectory}/brief-deletion-deployment.json`, JSON.stringify({ commit: (await sourceState()).commit, previousCodeSha256: current.Configuration.CodeSha256, backup, route, verifiedAt: new Date().toISOString() }, null, 2))
  console.log('Production brief deletion schema, runtime, restricted connection and JWT route verified')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Brief deletion deployment failed'); process.exitCode = 1 })
