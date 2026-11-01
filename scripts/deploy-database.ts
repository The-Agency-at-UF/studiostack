import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { account, region, vpc, subnets, environments, infrastructure, executionPolicy, trust, roleArn } from '../infra/database/resources'
import { execute } from './dev-aws'

const stackName = 'studiostack-database-connections'
const directory = resolve('.aws/database-deployment')
type Cluster = { DBClusterIdentifier: string; Status: string; Endpoint: string; DatabaseName: string; Port: number; MasterUserSecret: { SecretArn: string }; VpcSecurityGroups: { VpcSecurityGroupId: string }[] }
type Stack = { StackStatus: string; Tags?: { Key: string; Value: string }[]; Outputs?: { OutputKey: string; OutputValue: string }[] }

async function aws<T>(service: string, operation: string, args: string[] = []): Promise<T> {
  const result = await execute('aws', [service, operation, ...args, '--profile', 'studiostack-dev', '--region', region, '--output', 'json', '--no-cli-pager'], { maxBuffer: 8 * 1024 * 1024 })
  return (result.stdout.trim() ? JSON.parse(result.stdout) : undefined) as T
}
const pause = () => new Promise(resolvePause => setTimeout(resolvePause, 5000))
async function waitStack() {
  let previous = ''
  for (let attempt = 0; attempt < 180; attempt++) {
    const { Stacks: [stack] } = await aws<{ Stacks: Stack[] }>('cloudformation', 'describe-stacks', ['--stack-name', stackName])
    if (stack.StackStatus !== previous) { console.log(`Infrastructure: ${stack.StackStatus}`); previous = stack.StackStatus }
    if (['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(stack.StackStatus)) return Object.fromEntries((stack.Outputs ?? []).map(output => [output.OutputKey, output.OutputValue]))
    if (!stack.StackStatus.endsWith('_IN_PROGRESS')) throw new Error('Infrastructure failed; review CloudFormation stack events')
    await pause()
  }
  throw new Error('Infrastructure did not complete within the deployment window')
}
async function stack(template: unknown) {
  const templatePath = `${directory}/infrastructure.json`
  await writeFile(templatePath, JSON.stringify(template, null, 2)) // Generated, ignored deployment artifact; no credential values.
  const stacks = await aws<{ StackSummaries: { StackName: string; StackStatus: string }[] }>('cloudformation', 'list-stacks')
  const existing = stacks.StackSummaries.find(value => value.StackName === stackName && value.StackStatus !== 'DELETE_COMPLETE')
  if (existing) {
    const { Stacks: [details] } = await aws<{ Stacks: Stack[] }>('cloudformation', 'describe-stacks', ['--stack-name', stackName])
    if (!details.Tags?.some(tag => tag.Key === 'ManagedBy' && tag.Value === 'StudioStack')) throw new Error('Refusing to update an unowned stack')
  }
  try {
    await aws('cloudformation', existing ? 'update-stack' : 'create-stack', ['--stack-name', stackName, '--template-body', `file://${templatePath}`, '--capabilities', 'CAPABILITY_NAMED_IAM', '--tags', 'Key=ManagedBy,Value=StudioStack'])
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('No updates are to be performed')) throw error
  }
  return waitStack()
}
async function waitFunction(name: string) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const current = await aws<{ State: string; LastUpdateStatus: string }>('lambda', 'get-function-configuration', ['--function-name', name])
    // Newly created functions can omit LastUpdateStatus until their first update.
    if (current.State === 'Active' && (!current.LastUpdateStatus || current.LastUpdateStatus === 'Successful')) return
    if (current.State === 'Failed' || current.LastUpdateStatus === 'Failed') throw new Error(`Function deployment failed: ${name}`)
    await pause()
  }
  throw new Error(`Function not ready: ${name}`)
}
async function deployFunction(name: string, role: string, group: string, vars: Record<string, string>, bundle: string, temporary: boolean) {
  const existing = (await aws<{ Functions: { FunctionName: string; Role: string }[] }>('lambda', 'list-functions')).Functions.find(fn => fn.FunctionName === name)
  const settings = ['--function-name', name, '--role', role, '--handler', 'index.handler', '--runtime', 'nodejs24.x', '--timeout', '90', '--memory-size', '256', '--environment', JSON.stringify({ Variables: vars }), '--vpc-config', JSON.stringify({ SubnetIds: subnets, SecurityGroupIds: [group], Ipv6AllowedForDualStack: false })]
  if (existing) {
    if (existing.Role !== role) throw new Error(`Refusing to overwrite an unrelated function: ${name}`)
    await aws('lambda', 'update-function-code', ['--function-name', name, '--zip-file', `fileb://${bundle}`])
    await waitFunction(name)
    await aws('lambda', 'update-function-configuration', settings)
  } else {
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await aws('lambda', 'create-function', [...settings, '--architectures', 'arm64', '--zip-file', `fileb://${bundle}`, '--tags', `ManagedBy=StudioStack,Temporary=${temporary}`])
        break
      } catch (error) {
        // IAM is eventually consistent. This error guarantees function creation
        // was rejected, so retrying cannot invoke setup or replay any SQL.
        if (!(error instanceof Error) || !error.message.includes('The role defined for the function cannot be assumed') || attempt === 11) throw error
        if (attempt === 0) console.log(`Waiting for IAM role propagation: ${name}`)
        await pause()
      }
    }
  }
  await waitFunction(name)
  // No provisioned concurrency, schedule, API integration or public function URL.
  console.log(`Ready: ${name}`)
}
async function invoke(name: string, environment: string) {
  const path = `${directory}/${name}-result.json`
  const metadata = await aws<{ FunctionError?: string }>('lambda', 'invoke', ['--function-name', name, '--payload', '{}', '--cli-binary-format', 'raw-in-base64-out', '--cli-read-timeout', '120', path])
  const result = JSON.parse(await readFile(path, 'utf8')) as { ok?: boolean; environment?: string; errorMessage?: string }
  if (metadata.FunctionError || !result.ok || result.environment !== environment) {
    // Only our static, sanitized bootstrap stage may be printed; never raw driver/AWS details.
    const stage = result.errorMessage?.match(/^Database setup unavailable \([a-z ]+\)$/)?.[0]
    throw new Error(`Connection verification failed: ${name}${stage ? ` (${stage})` : ''}`)
  }
  console.log(`Verified TLS/database: ${environment}`)
}
async function cleanupSetup(name: string) {
  const functions = await aws<{ Functions: { FunctionName: string; Role: string }[] }>('lambda', 'list-functions')
  const fn = functions.Functions.find(fn => fn.FunctionName === name)
  if (fn && fn.Role !== roleArn(`${name}-role`)) throw new Error('Refusing to remove an unrelated setup function')
  if (fn) {
    const { Tags: tags } = await aws<{ Tags?: Record<string, string> }>('lambda', 'list-tags', ['--resource', `arn:aws:lambda:${region}:${account}:function:${name}`])
    if (tags?.ManagedBy !== 'StudioStack' || tags.Temporary !== 'true') throw new Error('Refusing to remove an unowned setup function')
  }
  const roles = await aws<{ Roles: { RoleName: string }[] }>('iam', 'list-roles')
  const hasRole = roles.Roles.some(role => role.RoleName === `${name}-role`)
  if (hasRole) {
    const { Role: role } = await aws<{ Role: { Tags?: { Key: string; Value: string }[] } }>('iam', 'get-role', ['--role-name', `${name}-role`])
    if (!role.Tags?.some(tag => tag.Key === 'Temporary' && tag.Value === 'true') || !role.Tags.some(tag => tag.Key === 'ManagedBy' && tag.Value === 'StudioStack')) throw new Error('Refusing to remove an unowned setup role')
  }
  // Verify both resources before deleting either, including partial failed deployments.
  if (fn) await aws('lambda', 'delete-function', ['--function-name', name])
  if (hasRole) {
    const policies = await aws<{ PolicyNames: string[] }>('iam', 'list-role-policies', ['--role-name', `${name}-role`])
    for (const policy of policies.PolicyNames) await aws('iam', 'delete-role-policy', ['--role-name', `${name}-role`, '--policy-name', policy])
    await aws('iam', 'delete-role', ['--role-name', `${name}-role`])
  }
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--apply') throw new Error('Deployment requires explicit --apply after approval')
  await mkdir(directory, { recursive: true })
  const identity = await aws<{ Account: string }>('sts', 'get-caller-identity')
  if (identity.Account !== account) throw new Error('Wrong AWS account; refusing deployment')
  const deployed = await aws<{ Functions: { FunctionName: string; Environment?: { Variables?: Record<string, string> } }[] }>('lambda', 'list-functions')
  if (deployed.Functions.some(fn => fn.FunctionName.startsWith('studiostack-') && fn.Environment?.Variables?.DATABASE_API_ID)) throw new Error('Connection-only deployment disabled after API rollout; use the environment-specific API deployment to preserve routes and photo permissions')
  const clusters = (await aws<{ DBClusters: Cluster[] }>('rds', 'describe-db-clusters')).DBClusters
  const masterSecrets = { dev: '', prod: '' }
  for (const env of environments) {
    const cluster = clusters.find(value => value.DBClusterIdentifier === `studiostack-${env.name}-db`)
    if (!cluster || cluster.Status !== 'available' || cluster.Port !== 5432 || cluster.DatabaseName !== `studiostack${env.name}` ||
        cluster.VpcSecurityGroups.length !== 1 || cluster.VpcSecurityGroups[0].VpcSecurityGroupId !== env.databaseGroup) throw new Error(`Unexpected database config: ${env.name}`)
    masterSecrets[env.name] = cluster.MasterUserSecret.SecretArn
  }
  const network = await aws<{ Subnets: { SubnetId: string; VpcId: string }[] }>('ec2', 'describe-subnets', ['--subnet-ids', ...subnets])
  if (network.Subnets.length !== 2 || network.Subnets.some(subnet => subnet.VpcId !== vpc)) throw new Error('Unexpected deployment subnets')

  const outputs = await stack(infrastructure(masterSecrets, true))
  let completed = false
  try {
    for (const env of environments) {
      const name = `studiostack-${env.name}-database`
      const setup = `${name}-setup`
      const appSecret = outputs[`${env.logical}SecretArn`]
      const cluster = clusters.find(value => value.DBClusterIdentifier === `studiostack-${env.name}-db`)!
      const vars = { STUDIOSTACK_ENV: env.name, RDS_AWS_ACCOUNT_ID: account, RDS_HOST: cluster.Endpoint,
        RDS_DATABASE: cluster.DatabaseName, RDS_PORT: '5432', RDS_CA_BUNDLE_PATH: '/var/task/certs/us-east-2-bundle.pem', RDS_CONNECT_TIMEOUT_MS: '45000' }
      const roles = await aws<{ Roles: { RoleName: string }[] }>('iam', 'list-roles')
      if (!roles.Roles.some(role => role.RoleName === `${setup}-role`)) await aws('iam', 'create-role', ['--role-name', `${setup}-role`, '--assume-role-policy-document', JSON.stringify(trust), '--tags', 'Key=ManagedBy,Value=StudioStack', 'Key=Temporary,Value=true'])
      else {
        const { Role: role } = await aws<{ Role: { Tags?: { Key: string; Value: string }[] } }>('iam', 'get-role', ['--role-name', `${setup}-role`])
        if (!role.Tags?.some(tag => tag.Key === 'Temporary' && tag.Value === 'true') || !role.Tags.some(tag => tag.Key === 'ManagedBy' && tag.Value === 'StudioStack')) throw new Error('Refusing to modify an unowned setup role')
      }
      await aws('iam', 'put-role-policy', ['--role-name', `${setup}-role`, '--policy-name', 'temporary-database-login-setup', '--policy-document', JSON.stringify(executionPolicy(setup, [masterSecrets[env.name], appSecret]))])
      // Allow time for a newly created role to become assumable by Lambda.
      await pause()
      await deployFunction(setup, roleArn(`${setup}-role`), env.group, { ...vars, RDS_SECRET_ARN: masterSecrets[env.name], RDS_APP_SECRET_ARN: appSecret }, resolve('.aws/database-setup.zip'), true)
      await invoke(setup, env.name)
      await deployFunction(name, outputs[`${env.logical}RoleArn`], env.group, { ...vars, RDS_SECRET_ARN: appSecret }, resolve('.aws/database-lambda.zip'), false)
      await invoke(name, env.name)
      await cleanupSetup(setup)
      console.log(`Temporary master access removed: ${env.name}`)
    }
    completed = true
  } finally {
    // Remove temporary callable code/permissions even if setup or verification failed.
    for (const env of environments) await cleanupSetup(`studiostack-${env.name}-database-setup`)
    await stack(infrastructure(masterSecrets, false))
    console.log('Endpoint policy restricted to runtime application secrets only')
  }
  if (!completed) throw new Error('Deployment incomplete; inspect sanitized stage and rerun after repair')
  console.log(`Deployment complete. Shared private endpoint: ${outputs.EndpointId}`)
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Database deployment failed')
  process.exitCode = 1
})
