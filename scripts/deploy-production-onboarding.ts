import { writeFile } from 'node:fs/promises'
import { aws, invoke, pause, waitFunction } from './dev-aws'
import { guardProductionApply, productionMetadata, prodDirectory } from './prod-aws'
import { withProductionMaintenance, invokeProductionMaintenance } from './production-database'
import { deployProductionRoutes } from './deploy-production-api'
import { deployProductionDeliveryWorkers } from './deploy-production-application'
import { selectedBuild, sourceState } from './database-build'
import { roleArn } from '../infra/database/resources'

/** Deploy onboarding's schema, database runtime, API route and account worker before the website that needs them. */
async function main() {
  await guardProductionApply()
  const build = await selectedBuild('prod'), metadata = await productionMetadata()
  const name = 'studiostack-prod-database'
  const current = await aws<{ Configuration: { Role: string; Architectures: string[]; CodeSha256: string }; Code: { Location: string } }>('lambda', 'get-function', ['--function-name', name])
  if (current.Configuration.Role !== roleArn(name + '-role') || current.Configuration.Architectures[0] !== 'arm64') throw new Error('Unexpected production runtime identity')
  const previous = await fetch(current.Code.Location)
  if (!previous.ok) throw new Error('Unable to preserve production runtime')
  const backup = `${prodDirectory}/onboarding-runtime-${Date.now()}.zip`
  await writeFile(backup, Buffer.from(await previous.arrayBuffer()), { flag: 'wx' })
  let applied: string[] = []
  await withProductionMaintenance(async () => {
    const schema = await invokeProductionMaintenance<{ ok: boolean; environment: string; applied: string[] }>({})
    if (!schema.ok || schema.environment !== 'prod') throw new Error('Production schema verification failed')
    applied = schema.applied
    console.log('Production migrations applied: ' + (applied.join(', ') || 'none'))
  })
  await aws('lambda', 'update-function-code', ['--function-name', name, '--zip-file', `fileb://${build.runtime}`])
  await waitFunction(name)
  if (!(await invoke<{ ok: boolean }>(name, {})).ok) throw new Error('Restricted production database connection failed')
  await deployProductionRoutes(metadata)
  // The organization search route belongs to the verified account worker, deployed with its stack.
  await deployProductionDeliveryWorkers(metadata)
  const { Items } = await aws<{ Items: { RouteKey: string; AuthorizationType: string }[] }>('apigatewayv2', 'get-routes', ['--api-id', metadata.apiId])
  const routes = ['POST /me/onboarding', 'POST /account/onboarding/searches']
  for (const route of routes) if (!Items.some(r => r.RouteKey === route && r.AuthorizationType === 'JWT')) throw new Error(`Protected route missing: ${route}`)
  const endpoint = `https://${metadata.apiId}.execute-api.us-east-2.amazonaws.com`
  for (const path of ['/me/onboarding', '/account/onboarding/searches']) {
    await pause(600)
    const response = await fetch(endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30000) })
    if (response.status !== 401) throw new Error(`Unauthenticated ${path} returned ${response.status}`)
  }
  await writeFile(`${prodDirectory}/onboarding-deployment.json`, JSON.stringify({ commit: (await sourceState()).commit, previousCodeSha256: current.Configuration.CodeSha256, backup, migrations: applied, routes, verifiedAt: new Date().toISOString() }, null, 2))
  console.log('Production onboarding schema, runtime, account worker and JWT routes verified')
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Onboarding deployment failed'); process.exitCode = 1 })
