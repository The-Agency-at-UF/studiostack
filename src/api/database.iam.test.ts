// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const signed = vi.hoisted(() => ({ options: [] as unknown[], tokens: 0 }))
vi.mock('@aws-sdk/rds-signer', () => ({
  Signer: class { constructor(options: unknown) { signed.options.push(options) } async getAuthToken() { signed.tokens++; return `TEST-ONLY-TOKEN-${signed.tokens}` } },
}))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn().mockResolvedValue('-----BEGIN CERTIFICATE-----\nTEST-ONLY') }))
const connected = vi.hoisted(() => [] as { user?: string; password?: string }[])
vi.mock('pg', () => ({ default: { Client: class {
  constructor(private options: { user?: string; password?: string }) {}
  async connect() { connected.push(this.options) }
  async query() { return { rows: [], rowCount: 0 } }
  async end() {}
} } }))

const { databaseConfig } = await import('../../backend/database/config')
const { createDatabase } = await import('../../backend/database/client')

describe('IAM database login', () => {
  it('signs a token for the configured host, port, user and region, then reuses it', async () => {
    const config = databaseConfig({ STUDIOSTACK_ENV: 'prod', AWS_REGION: 'us-east-2', RDS_AWS_ACCOUNT_ID: '111122223333',
      RDS_HOST: 'studiostack-prod-pg.abcdefghijkl.us-east-2.rds.amazonaws.com', RDS_DATABASE: 'studiostackprod',
      RDS_AUTH: 'iam', RDS_IAM_USER: 'studiostack_prod_app', RDS_CA_BUNDLE_PATH: './test-ca.pem' })
    const database = createDatabase(config)
    await database.query('SELECT 1')
    await database.query('SELECT 1')
    expect(signed.options).toEqual([{ hostname: config.host, port: 5432, username: 'studiostack_prod_app', region: 'us-east-2' }])
    expect(connected.map(options => [options.user, options.password])).toEqual([
      ['studiostack_prod_app', 'TEST-ONLY-TOKEN-1'], ['studiostack_prod_app', 'TEST-ONLY-TOKEN-1']])
  })
})
