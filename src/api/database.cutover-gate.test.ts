// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { main } from '../../scripts/cutover-prod-to-rds'
import { aws, invoke, waitFunction } from '../../scripts/dev-aws'
import { recordProductionCutover } from '../../scripts/prod-rds'

vi.mock('node:fs/promises', async importOriginal => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  writeFile: vi.fn(),
}))
vi.mock('../../scripts/dev-aws', () => ({ aws: vi.fn(), invoke: vi.fn(), waitFunction: vi.fn(), pause: vi.fn() }))
vi.mock('../../scripts/prod-aws', () => ({ guardProductionApply: vi.fn(), prodDirectory: '/fixture' }))
vi.mock('../../scripts/prod-rds', () => ({
  productionRds: async () => ({InstanceId:'fixture',Endpoint:'fixture-rds',MasterSecretArn:'fixture-secret'}),
  recordProductionCutover: vi.fn(),
}))
vi.mock('../../scripts/production-database', () => ({
  withProductionMaintenance: async (run: () => Promise<void>) => run(),
  invokeProductionMaintenance: async () => ({ok:true}),
}))

describe('LOGIC-001 cutover write fence', () => {
  const argv = process.argv
  let host: string
  let fence: number
  let trace: string[]
  beforeEach(() => {
    vi.resetAllMocks()
    process.argv = ['node','cutover-prod-to-rds.ts','--apply-prod']
    host = 'fixture-aurora'
    fence = 4
    trace = []
    const code = 'fixture runtime'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(code)))
    const runtimeConfig = () => ({
      RevisionId:host,Timeout:28,Runtime:'nodejs24.x',Handler:'index.handler',Role:'fixture-role',
      MemorySize:1024,Architectures:['arm64'],VpcConfig:{SubnetIds:[],SecurityGroupIds:[]},
      CodeSha256:createHash('sha256').update(code).digest('base64'),
      Environment:{Variables:{RDS_HOST:host,...(host==='fixture-rds'?{RDS_AUTH:'iam',RDS_IAM_USER:'studiostack_prod_app'}:{RDS_SECRET_ARN:'fixture-app-secret'})}},
    })
    vi.mocked(aws).mockImplementation(async (_, action, args = []) => {
      if (action === 'describe-db-cluster-snapshots') return {DBClusterSnapshots:[{Status:'available'}]}
      if (action === 'describe-rule') return {State:'ENABLED'}
      if (action === 'get-function-concurrency') return {ReservedConcurrentExecutions:fence}
      if (action === 'get-function') return {Configuration:runtimeConfig(),Code:{Location:'https://fixture.test/runtime'}}
      if (action === 'get-function-configuration') return runtimeConfig()
      if (action === 'put-function-concurrency') {
        fence = Number(args.at(-1))
        trace.push(fence ? `open:${host}` : 'fenced')
      }
      if (action === 'update-function-configuration') {
        host = JSON.parse(args[args.indexOf('--environment')+1]).Variables.RDS_HOST
        trace.push(`switch:${host}`)
      }
    })
    vi.mocked(recordProductionCutover).mockImplementation(async () => {
      trace.push('recorded')
      expect(fence).toBe(0)
    })
    vi.mocked(invoke).mockImplementation(async () => {
      trace.push(`probe:${fence}`)
      return {ok:true,environment:'prod'}
    })
  })
  afterEach(() => { process.argv = argv; vi.unstubAllGlobals() })

  it('keeps writes fenced through verification and records success before reopening on RDS', async () => {
    await main()
    expect(trace).toContain('probe:0')
    expect(trace.indexOf('recorded')).toBeLessThan(trace.indexOf('open:fixture-rds'))
  })

  it('restores the original target while fenced when switching cannot be verified', async () => {
    let runtimeWaits = 0
    vi.mocked(waitFunction).mockImplementation(async name => {
      if (name==='studiostack-prod-database' && runtimeWaits++===0) throw new Error('fixture waiter failed')
    })
    await expect(main()).rejects.toThrow('fixture waiter failed')
    expect(trace).toContain('open:fixture-aurora')
    expect(trace).not.toContain('open:fixture-rds')
    expect(recordProductionCutover).not.toHaveBeenCalled()
  })
  it('keeps RDS authoritative if reopening may already have admitted writes', async () => {
    const original = vi.mocked(aws).getMockImplementation()!
    vi.mocked(aws).mockImplementation(async (service,action,args) => {
      const result = await original(service,action,args)
      if (action==='put-function-concurrency' && fence>0) throw new Error('fixture response lost')
      return result
    })
    await expect(main()).rejects.toThrow('may already accept RDS writes')
    expect(trace).toContain('open:fixture-rds')
    expect(trace).not.toContain('switch:fixture-aurora')
  })
  it('reopens on Aurora when the final cutover record fails', async () => {
    vi.mocked(recordProductionCutover).mockRejectedValueOnce(new Error('fixture record failed'))
    await expect(main()).rejects.toThrow('fixture record failed')
    expect(trace).toContain('open:fixture-aurora')
    expect(trace).not.toContain('open:fixture-rds')
  })
})
