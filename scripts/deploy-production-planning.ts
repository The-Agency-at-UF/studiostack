import { writeFile } from 'node:fs/promises'
import { aws, invoke, waitFunction } from './dev-aws'
import { guardProductionApply, productionMetadata, prodDirectory } from './prod-aws'
import { withProductionMaintenance, invokeProductionMaintenance } from './production-database'
import { deployProductionRoutes } from './deploy-production-api'
import { selectedBuild, sourceState } from './database-build'
import { roleArn } from '../infra/database/resources'
import { databaseApiScope } from '../backend/database/api'

/** Apply the reviewed planning schema and restricted runtime before publishing the matching website. */
async function main() {
  await guardProductionApply()
  const build = await selectedBuild('prod'), metadata = await productionMetadata()
  const name = 'studiostack-prod-database'
  const current = await aws<{ Configuration: { Role: string; Architectures: string[]; CodeSha256: string }; Code: { Location: string } }>('lambda', 'get-function', ['--function-name', name])
  if (current.Configuration.Role !== roleArn(name + '-role') || current.Configuration.Architectures[0] !== 'arm64') throw new Error('Unexpected production runtime identity')
  const previous = await fetch(current.Code.Location)
  if (!previous.ok) throw new Error('Unable to preserve production runtime')
  const backup = `${prodDirectory}/planning-runtime-${Date.now()}.zip`
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
  const routes = [
    'GET /organizations/{organizationId}/production/clients/{clientId}/logo',
    'GET /organizations/{organizationId}/production/ideas',
    'POST /organizations/{organizationId}/production/ideas',
    'PATCH /organizations/{organizationId}/production/ideas/{ideaId}',
  ]
  const { Items } = await aws<{ Items: { RouteKey: string; AuthorizationType: string; AuthorizationScopes?: string[] }[] }>('apigatewayv2', 'get-routes', ['--api-id', metadata.apiId])
  for (const route of routes) if (!Items.some(r => r.RouteKey === route && r.AuthorizationType === 'JWT' && r.AuthorizationScopes?.includes(databaseApiScope))) throw new Error(`Protected planning route missing: ${route}`)
  for (const path of ['/organizations/00000000-0000-0000-0000-000000000000/production/ideas', '/organizations/00000000-0000-0000-0000-000000000000/production/clients/00000000-0000-0000-0000-000000000000/logo']) {
    const response = await fetch(`https://${metadata.apiId}.execute-api.us-east-2.amazonaws.com${path}`, {signal: AbortSignal.timeout(30000)})
    if (response.status !== 401) throw new Error('Planning authentication boundary failed')
  }
  await writeFile(`${prodDirectory}/planning-deployment.json`, JSON.stringify({ commit: (await sourceState()).commit, previousCodeSha256: current.Configuration.CodeSha256, backup, routes, verifiedAt: new Date().toISOString() }, null, 2))
  console.log('Production planning schema, runtime, restricted connection and JWT routes verified')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Production planning deployment failed'); process.exitCode = 1 })
