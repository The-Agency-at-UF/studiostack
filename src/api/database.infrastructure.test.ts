// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { infrastructure, executionPolicy, account, region, environments } from '../../infra/database/resources'
const mocks = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), create: vi.fn(), query: vi.fn(), appQuery: vi.fn() }))
vi.mock('@aws-sdk/client-secrets-manager', () => ({
  GetSecretValueCommand: class { constructor(public input: unknown) {} },
  SecretsManagerClient: class { send = mocks.send; destroy = mocks.destroy },
}))
vi.mock('../../backend/database/client', async original => {
  const actual = await original<typeof import('../../backend/database/client')>()
  return { ...actual, createDatabase: mocks.create }
})
import { handler } from '../../backend/database/bootstrap'

describe('environment-scoped private infrastructure', () => {
  const masters = { dev: 'dev-master-marker', prod: 'prod-master-marker' }
  it('removes all temporary master-secret access from the final endpoint policy', () => {
    const initial = infrastructure(masters, true)
    const final = infrastructure(masters, false)
    expect(JSON.stringify(initial.Resources.SecretsEndpoint)).toContain('dev-master-marker')
    expect(JSON.stringify(final.Resources.SecretsEndpoint)).not.toContain('master-marker')
    expect(JSON.stringify(final.Resources.SecretsEndpoint)).not.toContain('-setup-role')
    expect(JSON.stringify(final.Resources.SecretsEndpoint)).toContain('PrivateDnsEnabled')
  })
  it('keeps master references out of runtime roles and generates credentials in AWS', () => {
    const template = infrastructure(masters, true)
    for (const env of environments) {
      expect(JSON.stringify(template.Resources[`${env.logical}Role`])).not.toContain('master-marker')
      expect(JSON.stringify(template.Resources[`${env.logical}Role`])).toContain(`${env.logical}Secret`)
      expect(JSON.stringify(template.Resources[`${env.logical}Secret`])).toContain('GenerateSecretString')
    }
  })
  it('limits endpoint inbound HTTPS to the two existing backend groups', () => {
    const json = JSON.stringify(infrastructure(masters, false).Resources.EndpointGroup)
    expect(json).toContain('"FromPort":443')
    expect(json).toContain(environments[0].group)
    expect(json).toContain(environments[1].group)
    expect(json).not.toContain('0.0.0.0/0')
  })
  it('requires private-VPC secret retrieval and denies code-driven ENI writes', () => {
    const policy = executionPolicy('example', ['application-secret'])
    expect(policy.Statement).toContainEqual(expect.objectContaining({ Action: ['secretsmanager:GetSecretValue'], Resource: ['application-secret'], Condition: { StringEquals: { 'aws:SourceVpc': 'vpc-0c566c49de9c91bda' } } }))
    expect(policy.Statement).toContainEqual(expect.objectContaining({ Effect: 'Deny', Condition: { ArnEquals: { 'lambda:SourceFunctionArn': `arn:aws:lambda:${region}:${account}:function:example` } } }))
  })
  it('adds dev photo access without changing production resources or granting prod maintenance', () => {
    const old = infrastructure(masters, false), dev = infrastructure(masters, ['dev'], { prefixListId: 'pl-example' })
    for (const [name, resource] of Object.entries(old.Resources)) if (name.startsWith('Prod')) expect(dev.Resources[name]).toEqual(resource)
    const endpoint = JSON.stringify(dev.Resources.SecretsEndpoint)
    expect(endpoint).toContain('dev-master-marker')
    expect(endpoint).not.toContain('prod-master-marker')
    expect(endpoint).not.toContain('studiostack-prod-database-setup-role')
    expect(JSON.stringify(dev.Resources.DevRole)).toContain('studio-stack-photos-dev/staging/*')
    expect(JSON.stringify(dev.Resources.DevRole)).not.toContain('studio-stack-photos-prod')
    expect(JSON.stringify(dev.Resources.DevS3Endpoint)).not.toContain('studiostack-prod-database-role')
  })
})

describe('fixed-purpose temporary login setup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    for (const [key, value] of Object.entries({ STUDIOSTACK_ENV: 'dev', AWS_REGION: region, RDS_AWS_ACCOUNT_ID: account,
      RDS_HOST: 'studiostack-dev-db.cluster-example.us-east-2.rds.amazonaws.com', RDS_DATABASE: 'studiostackdev', RDS_CA_BUNDLE_PATH: '/test.pem',
      RDS_SECRET_ARN: `arn:aws:secretsmanager:${region}:${account}:secret:rds!example`,
      RDS_APP_SECRET_ARN: `arn:aws:secretsmanager:${region}:${account}:secret:studiostack/dev/database-app-example` })) vi.stubEnv(key, value)
    mocks.send.mockResolvedValue({ SecretString: JSON.stringify({ username: 'studiostack_dev_app', password: 'A'.repeat(48) }) })
    mocks.query.mockResolvedValue({ rows: [] })
    mocks.appQuery.mockResolvedValue({ rows: [{ database: 'studiostackdev', tls: true }] })
    mocks.create.mockReturnValue({ transaction: (operation: (client: { query: typeof mocks.query }) => Promise<unknown>) => operation({ query: mocks.query }), query: mocks.appQuery })
  })
  afterEach(() => vi.unstubAllEnvs())
  it('creates only a restricted app login and verifies TLS, without returning the password', async () => {
    expect(await handler()).toEqual({ ok: true, environment: 'dev', applicationLogin: 'verified' })
    expect(mocks.query.mock.calls[1][0]).toContain('NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
    expect(mocks.query.mock.calls[2][0]).toBe('GRANT CONNECT ON DATABASE "studiostackdev" TO "studiostack_dev_app"')
    expect(mocks.query.mock.calls.some(call => /CREATE TABLE|ALTER ROLE|DROP /i.test(call[0]))).toBe(false)
  })
  it('rejects a production secret in dev before retrieving anything', async () => {
    vi.stubEnv('RDS_APP_SECRET_ARN', `arn:aws:secretsmanager:${region}:${account}:secret:studiostack/prod/database-app-example`)
    await expect(handler()).rejects.toThrow('configuration')
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('refuses an unexpected application identity', async () => {
    mocks.send.mockResolvedValue({ SecretString: JSON.stringify({ username: 'postgres', password: 'A'.repeat(48) }) })
    await expect(handler()).rejects.toThrow('application secret')
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('does not change or rotate an existing privileged login', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ rolsuper: true, rolcanlogin: true }] }).mockResolvedValueOnce({ rows: [{ count: '0' }] })
    await expect(handler()).rejects.toThrow('database login setup')
    expect(mocks.query.mock.calls.some(call => /CREATE ROLE|ALTER ROLE/i.test(call[0]))).toBe(false)
  })
  it('does not leak service failures or password values', async () => {
    mocks.send.mockRejectedValue(new Error('password=PRIVATE'))
    await expect(handler()).rejects.toThrow('Database setup unavailable (application secret)')
    expect(mocks.destroy).toHaveBeenCalled()
  })
  it('rejects unverified TLS on the final application connection', async () => {
    mocks.appQuery.mockResolvedValue({ rows: [{ database: 'studiostackdev', tls: false }] })
    await expect(handler()).rejects.toThrow('application login verification')
  })
})
