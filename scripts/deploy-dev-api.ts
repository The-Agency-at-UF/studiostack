import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { infrastructure, executionPolicy, trust, roleArn, subnets, account, region } from '../infra/database/resources'
import { databaseApiInfrastructure } from '../infra/database/api-resources'
import { aws, applyStack, guardDevApply, devDirectory, waitFunction, invoke, pause } from './dev-aws'

export interface DevMetadata { auth: Record<string, string>; network: Record<string, string>; masterSecrets: Record<'dev' | 'prod', string>; prefixListId: string }
export async function readMetadata(): Promise<DevMetadata> { return JSON.parse(await readFile(`${devDirectory}/metadata.json`, 'utf8')) }
export async function invokeMaintenance<T>(payload: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await invoke<T>('studiostack-dev-database-setup', payload) }
    catch (error) {
      // A denied read is guaranteed to occur before the SQL callback starts.
      // Never retry a database operation or an ambiguous Lambda invocation.
      if (!(error instanceof Error) || !/\((?:migrations|fixtures)\/secret\/AccessDenied[A-Za-z]+\)/.test(error.message) || attempt === 6) throw error
      console.log('Waiting for temporary dev credential-read permissions to propagate')
      await pause(20_000)
    }
  }
}
export async function removeMaintenance() {
  const name = 'studiostack-dev-database-setup', role = `${name}-role`
  const { Functions } = await aws<{ Functions: { FunctionName: string; Role: string }[] }>('lambda', 'list-functions')
  if (Functions.some(f => f.FunctionName === name)) {
    const { Tags } = await aws<{ Tags: Record<string, string> }>('lambda', 'list-tags', ['--resource', `arn:aws:lambda:${region}:${account}:function:${name}`])
    if (Tags.ManagedBy !== 'StudioStack' || Tags.Temporary !== 'true') throw new Error('Unowned maintenance function')
    await aws('lambda', 'delete-function', ['--function-name', name])
  }
  const { Roles } = await aws<{ Roles: { RoleName: string }[] }>('iam', 'list-roles')
  if (Roles.some(r => r.RoleName === role)) {
    const { Role } = await aws<{ Role: { Tags: { Key: string; Value: string }[] } }>('iam', 'get-role', ['--role-name', role])
    if (!Role.Tags.some(t => t.Key === 'Temporary' && t.Value === 'true') || !Role.Tags.some(t => t.Key === 'ManagedBy' && t.Value === 'StudioStack')) throw new Error('Unowned maintenance role')
    const policies = await aws<{ PolicyNames: string[] }>('iam', 'list-role-policies', ['--role-name', role])
    for (const policy of policies.PolicyNames) await aws('iam', 'delete-role-policy', ['--role-name', role, '--policy-name', policy])
    await aws('iam', 'delete-role', ['--role-name', role])
  }
}
export async function devVariables(metadata: DevMetadata) {
  const { DBClusters: [cluster] } = await aws<{ DBClusters: { Endpoint: string; DatabaseName: string; Status: string; Engine: string; VpcSecurityGroups: { VpcSecurityGroupId: string }[] }[] }>('rds', 'describe-db-clusters', ['--db-cluster-identifier', 'studiostack-dev-db'])
  if (cluster.Status !== 'available' || cluster.Engine !== 'aurora-postgresql' || cluster.DatabaseName !== 'studiostackdev' || cluster.VpcSecurityGroups.length !== 1 || cluster.VpcSecurityGroups[0].VpcSecurityGroupId !== 'sg-00b357564909ca20b') throw new Error('Unexpected dev cluster')
  return { STUDIOSTACK_ENV: 'dev', RDS_AWS_ACCOUNT_ID: account, RDS_HOST: cluster.Endpoint, RDS_DATABASE: 'studiostackdev', RDS_PORT: '5432', RDS_SECRET_ARN: metadata.network.DevSecretArn,
    RDS_CA_BUNDLE_PATH: '/var/task/certs/us-east-2-bundle.pem', RDS_CONNECT_TIMEOUT_MS: '18000', DATABASE_API_ID: 'vugf6fpl4k', COGNITO_USER_POOL_ID: metadata.auth.UserPoolId, COGNITO_APP_CLIENT_ID: metadata.auth.AppClientId, S3_PHOTOS_BUCKET: 'studio-stack-photos-dev' }
}
export async function withMaintenance<T>(metadata: DevMetadata, runId: string, operation: () => Promise<T>) {
  const name = 'studiostack-dev-database-setup'
  await applyStack('studiostack-database-connections', infrastructure(metadata.masterSecrets, ['dev'], { prefixListId: metadata.prefixListId }))
  try {
    const { Roles } = await aws<{ Roles: { RoleName: string }[] }>('iam', 'list-roles')
    if (Roles.some(r => r.RoleName === `${name}-role`)) throw new Error('Unexpected preexisting maintenance role; inspect ownership first')
    await aws('iam', 'create-role', ['--role-name', `${name}-role`, '--assume-role-policy-document', JSON.stringify(trust), '--tags', 'Key=ManagedBy,Value=StudioStack', 'Key=Temporary,Value=true'])
    await aws('iam', 'put-role-policy', ['--role-name', `${name}-role`, '--policy-name', 'dev-temporary-schema', '--policy-document', JSON.stringify(executionPolicy(name, [metadata.masterSecrets.dev, metadata.network.DevSecretArn]))])
    await pause(15_000)
    const vars = { ...await devVariables(metadata), RDS_SECRET_ARN: metadata.masterSecrets.dev, RDS_APP_SECRET_ARN: metadata.network.DevSecretArn, RDS_CONNECT_TIMEOUT_MS: '45000', APPLY_DATABASE_API_SCHEMA: 'yes', FIXTURE_RUN_ID: runId }
    await aws('lambda', 'create-function', ['--function-name', name, '--role', roleArn(`${name}-role`), '--handler', 'index.handler', '--runtime', 'nodejs24.x', '--architectures', 'arm64', '--timeout', '90', '--memory-size', '256', '--environment', JSON.stringify({ Variables: vars }), '--vpc-config', JSON.stringify({ SubnetIds: subnets, SecurityGroupIds: ['sg-06b804b6a003b95e0'] }), '--zip-file', `fileb://${resolve('.aws/database-api/setup.zip')}`, '--tags', 'ManagedBy=StudioStack,Temporary=true'])
    await waitFunction(name)
    // Endpoint policy changes and newly recreated IAM roles propagate separately
    // from CloudFormation/Lambda readiness. No SQL is replayed during this wait.
    await pause(45_000)
    return await operation()
  } finally {
    await removeMaintenance()
    await applyStack('studiostack-database-connections', infrastructure(metadata.masterSecrets, false, { prefixListId: metadata.prefixListId }))
    console.log('Temporary dev maintenance function/role removed; endpoint runtime-only')
  }
}
async function main() {
  await guardDevApply()
  const metadata = await readMetadata()
  await withMaintenance(metadata, '20261013-00000000', async () => {
    const result = await invokeMaintenance<{ ok: boolean; environment: string; applied: string[] }>({})
    if (!result?.ok || result.environment !== 'dev') throw new Error('Schema verification failed')
    console.log(`Applied dev migrations: ${result.applied.join(', ')}`)
  })
  const vars = await devVariables(metadata)
  const fn = await aws<{ Role: string; Architectures: string[] }>('lambda', 'get-function-configuration', ['--function-name', 'studiostack-dev-database'])
  if (fn.Role !== roleArn('studiostack-dev-database-role') || fn.Architectures[0] !== 'arm64') throw new Error('Unexpected dev Lambda owner/architecture')
  await aws('lambda', 'update-function-code', ['--function-name', 'studiostack-dev-database', '--zip-file', `fileb://${resolve('.aws/database-api/runtime.zip')}`])
  await waitFunction('studiostack-dev-database')
  await aws('lambda', 'update-function-configuration', ['--function-name', 'studiostack-dev-database', '--memory-size', '1024', '--timeout', '28', '--environment', JSON.stringify({ Variables: vars })])
  await waitFunction('studiostack-dev-database')
  const quota = await aws<{ AccountLimit: { ConcurrentExecutions: number; UnreservedConcurrentExecutions: number } }>('lambda', 'get-account-settings')
  if (quota.AccountLimit.UnreservedConcurrentExecutions >= 104) await aws('lambda', 'put-function-concurrency', ['--function-name', 'studiostack-dev-database', '--reserved-concurrent-executions', '4'])
  else console.log(`Account concurrency ${quota.AccountLimit.ConcurrentExecutions}: reservation unavailable; dev stage throttling and database connection limit retained`)
  const connection = await invoke<{ ok: boolean }>('studiostack-dev-database', {})
  if (!connection.ok) throw new Error('Dev restricted connection check failed')
  const routes = await applyStack('studiostack-dev-database-api', databaseApiInfrastructure(vars, true))
  const { Items } = await aws<{ Items: { RouteKey: string; RouteId: string }[] }>('apigatewayv2', 'get-routes', ['--api-id', vars.DATABASE_API_ID])
  const existing = Items.find(r => r.RouteKey === 'POST /photos/uploads')
  if (!existing) throw new Error('Expected existing photo route absent')
  await aws('apigatewayv2', 'update-route', ['--api-id', vars.DATABASE_API_ID, '--route-id', existing.RouteId, '--authorization-type', 'JWT', '--authorizer-id', routes.AuthorizerId, '--authorization-scopes', 'studiostack-api/access', '--target', `integrations/${routes.IntegrationId}`])
  await aws('apigatewayv2', 'update-api', ['--api-id', vars.DATABASE_API_ID, '--cors-configuration', JSON.stringify({ AllowOrigins: ['http://localhost:5174', 'http://localhost:5417'], AllowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'], AllowHeaders: ['Authorization', 'Content-Type'], MaxAge: 300 })])
  await aws('apigatewayv2', 'update-stage', ['--api-id', vars.DATABASE_API_ID, '--stage-name', '$default', '--default-route-settings', JSON.stringify({ ThrottlingRateLimit: 2, ThrottlingBurstLimit: 4 })])
  // Preserve all unrelated lifecycle rules. Only abandoned dev staging expires.
  let rules: Record<string, unknown>[] = []
  try { rules = (await aws<{ Rules: Record<string, unknown>[] }>('s3api', 'get-bucket-lifecycle-configuration', ['--bucket', 'studio-stack-photos-dev'])).Rules } catch (error) { if ((error as { code?: string }).code !== 'NoSuchLifecycleConfiguration') throw error }
  const lifecycle = { Rules: [...rules.filter(r => r.ID !== 'studiostack-dev-staging'), { ID: 'studiostack-dev-staging', Status: 'Enabled', Filter: { Prefix: 'staging/' }, Expiration: { Days: 1 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] }
  await aws('s3api', 'put-bucket-lifecycle-configuration', ['--bucket', 'studio-stack-photos-dev', '--lifecycle-configuration', JSON.stringify(lifecycle)])
  await writeFile(`${devDirectory}/api-deployment.json`, JSON.stringify({ deployedAt: new Date().toISOString(), routes, userPoolId: metadata.auth.UserPoolId, apiId: vars.DATABASE_API_ID }, null, 2))
  console.log('Dev 13 database + 3 photo routes deployed with Cognito scope; bucket remains private')
}
if (process.argv[1]?.endsWith('deploy-dev-api.ts')) main().catch(error => { console.error(error instanceof Error ? error.message : 'Dev API rollout failed'); process.exitCode = 1 })
