// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { rdsInstanceInfrastructure, rdsParameters } from '../../infra/database/rds-instance'

describe('RDS for PostgreSQL instance', () => {
  const template = rdsInstanceInfrastructure('prod'), { Resources } = template
  const database = Resources.Database.Properties
  it('is a private, encrypted, single-AZ db.t4g.micro on PostgreSQL 17 with IAM login', () => {
    expect(database).toMatchObject({ DBInstanceIdentifier: 'studiostack-prod-pg', Engine: 'postgres', EngineVersion: '17', DBInstanceClass: 'db.t4g.micro',
      MultiAZ: false, StorageType: 'gp3', AllocatedStorage: '20', MaxAllocatedStorage: 50, StorageEncrypted: true, PubliclyAccessible: false,
      EnableIAMDatabaseAuthentication: true, DBName: 'studiostackprod', VPCSecurityGroups: ['sg-062d80daa895fb7b6'] })
  })
  it('keeps production recovery: 14-day backups, deletion protection and a final snapshot', () => {
    expect(database).toMatchObject({ BackupRetentionPeriod: 14, DeletionProtection: true, CopyTagsToSnapshot: true })
    expect(Resources.Database).toMatchObject({ DeletionPolicy: 'Snapshot', UpdateReplacePolicy: 'Snapshot' })
    expect(rdsInstanceInfrastructure('dev').Resources.Database.Properties.BackupRetentionPeriod).toBe(7)
  })
  it('lets RDS manage a master secret the runtime refuses to use', () => {
    expect(database).toMatchObject({ MasterUsername: 'postgres', ManageMasterUserPassword: true })
    expect(JSON.stringify(template)).not.toMatch(/"MasterUserPassword"|secretsmanager:GetSecretValue/)
  })
  it('grants rds-db:connect only for the environment app user on this instance', () => {
    expect(Resources.IamLogin.Properties.RoleName).toBe('studiostack-prod-database-role')
    const [statement] = Resources.IamLogin.Properties.PolicyDocument.Statement
    expect(statement.Action).toBe('rds-db:connect')
    expect(JSON.stringify(statement.Resource)).toContain('/studiostack_prod_app')
    expect(JSON.stringify(statement.Resource)).toContain('DbiResourceId')
    expect(JSON.stringify(rdsInstanceInfrastructure('dev'))).not.toContain('studiostack-prod')
  })
  it('enforces TLS and turns on query diagnostics without logging bind parameters', () => {
    expect(Resources.Parameters.Properties).toMatchObject({ Family: 'postgres17', Parameters: rdsParameters })
    expect(rdsParameters).toMatchObject({ 'rds.force_ssl': '1', shared_preload_libraries: 'pg_stat_statements,auto_explain',
      log_parameter_max_length: '0', log_parameter_max_length_on_error: '0', 'auto_explain.log_parameter_max_length': '0' })
    expect(Resources.Logs.Properties).toEqual({ LogGroupName: '/aws/rds/instance/studiostack-prod-pg/postgresql', RetentionInDays: 14 })
  })
  it('creates no Aurora cluster, secret, endpoint or network changes', () => {
    expect(Object.values(Resources).map(r => r.Type).sort()).toEqual(['AWS::IAM::RolePolicy', 'AWS::Logs::LogGroup', 'AWS::RDS::DBInstance', 'AWS::RDS::DBParameterGroup', 'AWS::RDS::DBSubnetGroup'])
  })
  it('refuses an unknown environment', () => {
    expect(() => rdsInstanceInfrastructure('staging' as 'dev')).toThrow()
  })
})
