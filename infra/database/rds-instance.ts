import { account, region, subnets, environments } from './resources'

export type RdsEnvironment = 'dev' | 'prod'
export const rdsInstanceId = (env: RdsEnvironment) => `studiostack-${env}-pg`
export const rdsAppUser = (env: RdsEnvironment) => `studiostack_${env}_app`

/**
 * Settings shared by every StudioStack RDS for PostgreSQL instance, so an
 * environment created later matches production exactly apart from backups.
 * Query diagnostics are on; bind parameters are never written to logs because
 * they can hold emails or other personal data.
 */
export const rdsParameters: Record<string, string> = {
  'rds.force_ssl': '1',
  shared_preload_libraries: 'pg_stat_statements,auto_explain',
  'pg_stat_statements.track': 'top',
  log_min_duration_statement: '500',
  log_parameter_max_length: '0',
  log_parameter_max_length_on_error: '0',
  'auto_explain.log_min_duration': '1000',
  'auto_explain.log_parameter_max_length': '0',
}

/**
 * A private, encrypted single-AZ RDS for PostgreSQL 17 instance (db.t4g.micro)
 * with IAM database authentication, plus `rds-db:connect` for the existing
 * database runtime role. It replaces nothing: the Aurora cluster, app secret
 * and Secrets Manager endpoint stay until the cutover and cleanup PRs.
 */
export function rdsInstanceInfrastructure(env: RdsEnvironment) {
  const settings = environments.find(e => e.name === env)
  if (!settings) throw new Error('Explicit dev or prod environment required')
  const id = rdsInstanceId(env), runtimeRole = `studiostack-${env}-database-role`
  const tags = [{ Key: 'ManagedBy', Value: 'StudioStack' }, { Key: 'Environment', Value: env }]
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `StudioStack ${env} RDS for PostgreSQL instance with IAM login; no Aurora, secret or endpoint changes`,
    Resources: {
      SubnetGroup: { Type: 'AWS::RDS::DBSubnetGroup', Properties: {
        DBSubnetGroupName: `${id}-subnets`, DBSubnetGroupDescription: `Private subnets for ${id}`, SubnetIds: subnets, Tags: tags } },
      Parameters: { Type: 'AWS::RDS::DBParameterGroup', Properties: {
        DBParameterGroupName: `${id}-params`, Description: `StudioStack PostgreSQL 17 settings (${env})`, Family: 'postgres17', Parameters: rdsParameters, Tags: tags } },
      Logs: { Type: 'AWS::Logs::LogGroup', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
        LogGroupName: `/aws/rds/instance/${id}/postgresql`, RetentionInDays: 14 } },
      Database: { Type: 'AWS::RDS::DBInstance', DependsOn: 'Logs', DeletionPolicy: 'Snapshot', UpdateReplacePolicy: 'Snapshot', Properties: {
        DBInstanceIdentifier: id, Engine: 'postgres', EngineVersion: '17', AutoMinorVersionUpgrade: true,
        DBInstanceClass: 'db.t4g.micro', MultiAZ: false,
        StorageType: 'gp3', AllocatedStorage: '20', MaxAllocatedStorage: 50, StorageEncrypted: true,
        DBName: `studiostack${env}`, Port: '5432',
        // The runtime refuses this username, so the RDS-managed master secret is maintenance-only.
        MasterUsername: 'postgres', ManageMasterUserPassword: true,
        EnableIAMDatabaseAuthentication: true,
        DBSubnetGroupName: { Ref: 'SubnetGroup' }, VPCSecurityGroups: [settings.databaseGroup], PubliclyAccessible: false,
        DBParameterGroupName: { Ref: 'Parameters' }, CACertificateIdentifier: 'rds-ca-rsa2048-g1',
        BackupRetentionPeriod: env === 'prod' ? 14 : 7, CopyTagsToSnapshot: true, DeletionProtection: true,
        PreferredBackupWindow: '08:00-08:30', PreferredMaintenanceWindow: 'sun:09:00-sun:09:30',
        EnableCloudwatchLogsExports: ['postgresql'], Tags: tags } },
      // Attached to the existing runtime role by name, so redeploying the shared
      // connection stack can never silently drop the database login permission.
      IamLogin: { Type: 'AWS::IAM::RolePolicy', Properties: { RoleName: runtimeRole, PolicyName: `${id}-iam-login`, PolicyDocument: {
        Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: 'rds-db:connect',
          Resource: { 'Fn::Join': ['', [`arn:aws:rds-db:${region}:${account}:dbuser:`, { 'Fn::GetAtt': ['Database', 'DbiResourceId'] }, `/${rdsAppUser(env)}`]] } }] } } },
    },
    Outputs: {
      InstanceId: { Value: { Ref: 'Database' } },
      Endpoint: { Value: { 'Fn::GetAtt': ['Database', 'Endpoint.Address'] } },
      ResourceId: { Value: { 'Fn::GetAtt': ['Database', 'DbiResourceId'] } },
      MasterSecretArn: { Value: { 'Fn::GetAtt': ['Database', 'MasterUserSecret.SecretArn'] } },
    },
  }
}
