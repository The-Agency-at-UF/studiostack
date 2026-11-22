import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aws, waitFunction, invoke, pause } from './dev-aws'
import { guardProductionApply, prodDirectory } from './prod-aws'
import { productionRds, recordProductionCutover } from './prod-rds'
import { withProductionMaintenance, invokeProductionMaintenance } from './production-database'

const runtime = 'studiostack-prod-database'
const rules = ['studiostack-prod-accounts-recovery','studiostack-prod-production-notifications-schedule','studiostack-prod-database-retention']
type Variables = Record<string,string>
type FunctionConfig = {
  RevisionId: string
  Environment: { Variables: Variables }
  CodeSha256: string
  Role: string
  Runtime: string
  Handler: string
  MemorySize: number
  Timeout: number
  Architectures: string[]
  Layers?: { Arn: string }[]
  VpcConfig: { SubnetIds: string[]; SecurityGroupIds: string[]; Ipv6AllowedForDualStack?: boolean }
}

function runtimeConfiguration() {
  return aws<FunctionConfig>('lambda','get-function-configuration',['--function-name',runtime])
}

function updateVariables(variables: Variables, revision: string) {
  return aws('lambda','update-function-configuration',['--function-name',runtime,'--revision-id',revision,'--environment',JSON.stringify({Variables:variables})])
}

function sameVariables(left: Variables, right: Variables) {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([key,value]) => right[key] === value)
}

function setConcurrency(value?: number) {
  return value === undefined
    ? aws('lambda','delete-function-concurrency',['--function-name',runtime])
    : aws('lambda','put-function-concurrency',['--function-name',runtime,'--reserved-concurrent-executions',String(value)])
}

async function confirmFence() {
  const concurrency = await aws<{ReservedConcurrentExecutions?:number}>('lambda','get-function-concurrency',['--function-name',runtime])
  if (concurrency.ReservedConcurrentExecutions !== 0) throw new Error('Production write fence is not closed')
}

/** The candidate has no public integration and uses the current runtime code, role and VPC. */
async function verifyTarget(source: FunctionConfig, codeUrl: string, variables: Variables) {
  const name = `studiostack-prod-rds-probe-${randomUUID().slice(0,12)}`
  const directory = await mkdtemp(join(tmpdir(),'studiostack-rds-probe-'))
  const archive = join(directory,'runtime.zip')
  try {
    const response = await fetch(codeUrl,{signal:AbortSignal.timeout(30_000)})
    if (!response.ok) throw new Error('Unable to download the current runtime for the verification probe')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('base64') !== source.CodeSha256) throw new Error('Verification probe code does not match production')
    await writeFile(archive,bytes,{mode:0o600})
    const {SubnetIds,SecurityGroupIds,Ipv6AllowedForDualStack} = source.VpcConfig
    try {
      await aws('lambda','create-function',[
        '--function-name',name,'--role',source.Role,'--runtime',source.Runtime,'--handler',source.Handler,
        '--memory-size',String(source.MemorySize),'--timeout',String(source.Timeout),'--architectures',...source.Architectures,
        '--vpc-config',JSON.stringify({SubnetIds,SecurityGroupIds,Ipv6AllowedForDualStack}),
        '--environment',JSON.stringify({Variables:variables}),'--zip-file',`fileb://${archive}`,
        ...(source.Layers?.length ? ['--layers',...source.Layers.map(layer=>layer.Arn)] : []),
        '--tags','ManagedBy=StudioStack,Temporary=true',
      ])
      await waitFunction(name)
      const result = await invoke<{ok?:boolean;environment?:string}>(name,{})
      if (result?.ok !== true || result.environment !== 'prod') throw new Error('Restricted production RDS probe failed')
    } finally {
      await aws('lambda','delete-function',['--function-name',name]).catch(error => {
        if (error.code !== 'ResourceNotFoundException') throw error
      })
    }
  } finally {
    await rm(directory,{recursive:true,force:true})
  }
}

export async function main() {
  if (!process.argv.includes('--apply-prod')) {
    console.log('Dry run. An approved cutover snapshots Aurora, fences production, verifies RDS with a private probe, then opens writes on RDS.')
    return
  }
  await guardProductionApply()
  const rds = await productionRds()
  if (!rds) throw new Error('Create the RDS instance before cutting over')
  if (rds.cutoverAt) throw new Error(`Production already moved to RDS at ${rds.cutoverAt}`)
  const deployed = await aws<{Configuration:FunctionConfig;Code:{Location:string}}>('lambda','get-function',['--function-name',runtime])
  const before = deployed.Configuration.Environment.Variables
  if (before.RDS_HOST === rds.Endpoint || before.RDS_AUTH === 'iam') throw new Error('Production runtime already points to RDS')
  if (!before.RDS_HOST || !before.RDS_SECRET_ARN) throw new Error('Unexpected source database configuration')
  const {ReservedConcurrentExecutions:previousConcurrency} = await aws<{ReservedConcurrentExecutions?:number}>('lambda','get-function-concurrency',['--function-name',runtime])
  if (previousConcurrency === 0) throw new Error('Production is already fenced. Recover the earlier operation first')

  const started = new Date().toISOString()
  const snapshot = `studiostack-prod-db-pre-rds-${started.replace(/[^0-9]/g,'').slice(0,14)}`
  const evidence: Record<string,unknown> = {started,target:rds.InstanceId,snapshot}
  await aws('rds','create-db-cluster-snapshot',['--db-cluster-identifier','studiostack-prod-db','--db-cluster-snapshot-identifier',snapshot,'--tags','Key=ManagedBy,Value=StudioStack'])
  for (let attempt = 0; ; attempt++) {
    const {DBClusterSnapshots:[status]} = await aws<{DBClusterSnapshots:{Status:string}[]}>('rds','describe-db-cluster-snapshots',['--db-cluster-snapshot-identifier',snapshot])
    if (status.Status === 'available') break
    if (attempt >= 120) throw new Error('Aurora snapshot did not complete')
    await pause(10_000)
  }

  const enabledRules: string[] = []
  for (const name of rules) {
    const rule = await aws<{State:string}>('events','describe-rule',['--name',name])
    if (rule.State === 'ENABLED') enabledRules.push(name)
  }

  const {RDS_SECRET_ARN: _sourceSecret,...variables} = before
  void _sourceSecret
  const after = {...variables,RDS_HOST:rds.Endpoint,RDS_AUTH:'iam',RDS_IAM_USER:'studiostack_prod_app'}
  let switchAttempted = false
  let reopenAttempted = false
  const pausedRules: string[] = []
  try {
    await setConcurrency(0)
    await confirmFence()
    for (const name of enabledRules) {
      pausedRules.push(name)
      await aws('events','disable-rule',['--name',name])
    }
    await pause((deployed.Configuration.Timeout+2)*1000)
    await withProductionMaintenance(async () => {
      evidence.prepare = await invokeProductionMaintenance({action:'rds-prepare'},300)
      evidence.copy = await invokeProductionMaintenance({action:'rds-copy'},900)
      const verify = await invokeProductionMaintenance<{ok:boolean;differences:unknown;rows:Record<string,number>}>({action:'rds-verify'},900)
      evidence.verify = verify
      if (verify.ok !== true) throw new Error('Copied data does not match Aurora')
    },{timeout:900,cutoverTarget:{host:rds.Endpoint,masterSecretArn:rds.MasterSecretArn}})

    await verifyTarget(deployed.Configuration,deployed.Code.Location,after)
    await confirmFence()
    const current = await runtimeConfiguration()
    if (current.RevisionId !== deployed.Configuration.RevisionId || !sameVariables(current.Environment.Variables,before)) throw new Error('Production changed during verification')
    switchAttempted = true
    await updateVariables(after,current.RevisionId)
    await waitFunction(runtime)
    if (!sameVariables((await runtimeConfiguration()).Environment.Variables,after)) throw new Error('Production target did not verify')

    await confirmFence()
    const cutoverAt = new Date().toISOString()
    await writeFile(prodDirectory+'/rds-cutover.json',JSON.stringify({...evidence,switched:true,verifiedAt:cutoverAt},null,2))
    await recordProductionCutover(rds,cutoverAt)
    // An ambiguous response could mean that RDS has already accepted writes.
    reopenAttempted = true
    await setConcurrency(previousConcurrency)
    for (const name of pausedRules) await aws('events','enable-rule',['--name',name])
  } catch (error) {
    if (reopenAttempted) throw new Error('Production may already accept RDS writes. Reconcile concurrency and schedules on RDS',{cause:error})
    try {
      if (switchAttempted) {
        await confirmFence()
        await waitFunction(runtime)
        const current = await runtimeConfiguration()
        if (sameVariables(current.Environment.Variables,after)) {
          await updateVariables(before,current.RevisionId)
          await waitFunction(runtime)
        }
      }
      if (!sameVariables((await runtimeConfiguration()).Environment.Variables,before)) throw new Error('Original production target did not verify')
      await setConcurrency(previousConcurrency)
      for (const name of pausedRules) await aws('events','enable-rule',['--name',name])
    } catch (recoveryError) {
      throw new AggregateError([error,recoveryError],'Automatic recovery could not confirm the original production target and restore operations. Inspect runtime configuration and concurrency.')
    }
    throw error
  }
  console.log('Verified production runtime uses RDS with IAM login and writes are open')
}

if (process.argv[1]?.endsWith('cutover-prod-to-rds.ts')) main().catch(error => {
  console.error(error instanceof Error ? error.message : 'RDS cutover failed')
  process.exitCode = 1
})
