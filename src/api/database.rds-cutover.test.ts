// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handler } from '../../backend/database/api-setup'
import { digestDifferences } from '../../backend/database/rds-copy'

const base = { STUDIOSTACK_ENV: 'prod', AWS_REGION: 'us-east-2', RDS_AWS_ACCOUNT_ID: '111122223333', RDS_DATABASE: 'studiostackprod',
  RDS_HOST: 'studiostack-prod-db.cluster-example.us-east-2.rds.amazonaws.com', RDS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-2:111122223333:secret:aurora',
  RDS_CA_BUNDLE_PATH: './missing-ca.pem', APPLY_DATABASE_API_SCHEMA: 'yes', ALLOW_PRODUCTION_SCHEMA: 'yes',
  TARGET_RDS_HOST: 'studiostack-prod-pg.abcdefghijkl.us-east-2.rds.amazonaws.com', TARGET_RDS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-2:111122223333:secret:rds!db-1' }
const run = (env: Record<string, string>, action: 'rds-prepare' | 'rds-copy' | 'rds-verify' = 'rds-copy') => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return handler({ action })
}
afterEach(() => vi.unstubAllEnvs())

describe('Aurora to RDS cutover maintenance actions', () => {
  it('require an explicit cutover approval', async () => {
    await expect(run(base)).rejects.toThrow('Database API schema setup unavailable (rdscopy)')
  })
  it.each([
    { TARGET_RDS_HOST: 'studiostack-prod-db.cluster-other.us-east-2.rds.amazonaws.com' },
    { TARGET_RDS_HOST: 'studiostack-dev-pg.abcdefghijkl.us-east-2.rds.amazonaws.com' },
    { TARGET_RDS_SECRET_ARN: '' },
    { RDS_HOST: 'studiostack-prod-pg.abcdefghijkl.us-east-2.rds.amazonaws.com' },
  ])('refuse anything but this environment\'s Aurora source and RDS instance target %j', async override => {
    await expect(run({ ...base, ALLOW_RDS_CUTOVER: 'yes', ...override }, 'rds-prepare')).rejects.toThrow(/\(rdsprepare\)$/)
  })
})

describe('copy verification', () => {
  const digest = (rows: number, md5 = 'a') => ({ migrations: 'm', tables: { users: { rows, md5 }, inventory: { rows: 2, md5: 'b' } } })
  it('passes only when every table and the migrations match', () => {
    expect(digestDifferences(digest(1), digest(1))).toEqual({ migrations: false, tables: [] })
    expect(digestDifferences(digest(1), digest(2))).toEqual({ migrations: false, tables: ['users'] })
    expect(digestDifferences(digest(1), digest(1, 'z'))).toEqual({ migrations: false, tables: ['users'] })
    expect(digestDifferences(digest(1), { ...digest(1), migrations: 'other' }).migrations).toBe(true)
    expect(digestDifferences(digest(1), { migrations: 'm', tables: { users: { rows: 1, md5: 'a' } } }).tables).toEqual(['inventory'])
  })
})
