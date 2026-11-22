// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { aws } from '../../scripts/dev-aws'
import {configureProductionCapacity} from '../../scripts/configure-production-capacity'
import { productionDatabaseTarget } from '../../scripts/production-database'

vi.mock('node:fs/promises',()=>({writeFile:vi.fn(),readFile:vi.fn()}))
vi.mock('../../scripts/dev-aws', () => ({ aws: vi.fn() }))
vi.mock('../../scripts/prod-rds', () => ({ productionRds: async () => undefined }))
vi.mock('../../scripts/deploy-dev-api', () => ({ readMetadata: async () => { throw new Error('Unexpected legacy metadata read') } }))

describe('LOGIC-001 production database target', () => {
  const Address = 'studiostack-prod-pg.fixture.us-east-2.rds.amazonaws.com'
  const instance = {
    DBInstanceStatus:'available',Engine:'postgres',DBName:'studiostackprod',IAMDatabaseAuthenticationEnabled:true,
    Endpoint:{Address},VpcSecurityGroups:[{VpcSecurityGroupId:'sg-062d80daa895fb7b6'}],MasterUserSecret:{SecretArn:'fixture-secret'},
  }
  it('preserves the live RDS target on a checkout without cutover metadata', async () => {
    vi.mocked(aws).mockResolvedValueOnce({Environment:{Variables:{RDS_HOST:Address,RDS_AUTH:'iam',RDS_IAM_USER:'studiostack_prod_app'}}})
      .mockResolvedValueOnce({DBInstances:[instance]})
    await expect(productionDatabaseTarget()).resolves.toMatchObject({variables:{RDS_HOST:Address,RDS_AUTH:'iam'}})
    expect(aws).not.toHaveBeenCalledWith('rds','describe-db-clusters',expect.anything())
  })
  it('rejects an IAM host that does not match the approved RDS instance', async () => {
    vi.mocked(aws).mockResolvedValueOnce({Environment:{Variables:{RDS_HOST:'other.fixture',RDS_AUTH:'iam',RDS_IAM_USER:'studiostack_prod_app'}}})
      .mockResolvedValueOnce({DBInstances:[instance]})
    await expect(productionDatabaseTarget()).rejects.toThrow('Unexpected live production RDS target')
  })
})


it('LOGIC-001: the production capacity command respects a closed write fence',async()=>{
  vi.mocked(aws).mockClear()
  vi.mocked(aws).mockResolvedValueOnce({AccountLimit:{ConcurrentExecutions:200}})
    .mockResolvedValueOnce({Role:'arn:aws:iam::423563856930:role/studiostack-prod-database-role',State:'Active'})
    .mockResolvedValueOnce({DefaultRouteSettings:{}})
    .mockResolvedValueOnce({ReservedConcurrentExecutions:0})
  await expect(configureProductionCapacity({
    apiId:'ixzikwz8n5',auth:{},app:{appId:'fixture',branch:'main',origin:'https://fixture.example.test'}
  })).rejects.toThrow('write fence')
  expect(aws).not.toHaveBeenCalledWith('lambda','put-function-concurrency',expect.anything())
})
