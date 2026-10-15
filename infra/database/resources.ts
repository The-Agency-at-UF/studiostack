// Existing resources are referenced, not recreated or imported into this stack.
export const account = '423563856930'
export const region = 'us-east-2'
export const vpc = 'vpc-0c566c49de9c91bda'
export const subnets = ['subnet-0bb1005a604230bdc', 'subnet-0f6ccb58e6d1cfb26']
export const environments = [
  { name: 'dev', logical: 'Dev', group: 'sg-06b804b6a003b95e0', databaseGroup: 'sg-00b357564909ca20b' },
  { name: 'prod', logical: 'Prod', group: 'sg-0852d29f6cdd33552', databaseGroup: 'sg-062d80daa895fb7b6' },
] as const

const ref = (name: string) => ({ Ref: name })
const attr = (name: string, attribute: string) => ({ 'Fn::GetAtt': [name, attribute] })
export const roleArn = (name: string) => `arn:aws:iam::${account}:role/${name}`
export const functionArn = (name: string) => `arn:aws:lambda:${region}:${account}:function:${name}`
export const trust = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] }

export function executionPolicy(functionName: string, secretArns: unknown[]) {
  return {
    Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: ['ec2:CreateNetworkInterface', 'ec2:DescribeNetworkInterfaces', 'ec2:DescribeSubnets', 'ec2:DeleteNetworkInterface', 'ec2:AssignPrivateIpAddresses', 'ec2:UnassignPrivateIpAddresses'], Resource: '*' },
      // Lambda's managed VPC attachment needs ENI operations; function code does not.
      { Effect: 'Deny', Action: ['ec2:CreateNetworkInterface', 'ec2:DeleteNetworkInterface', 'ec2:AssignPrivateIpAddresses', 'ec2:UnassignPrivateIpAddresses'], Resource: '*', Condition: { ArnEquals: { 'lambda:SourceFunctionArn': functionArn(functionName) } } },
      { Effect: 'Allow', Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${functionName}:*` },
      { Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: secretArns, Condition: { StringEquals: { 'aws:SourceVpc': vpc } } },
    ],
  }
}

export function infrastructure(masterSecrets: Record<'dev' | 'prod', string>, includeSetup: boolean | readonly ('dev' | 'prod')[]) {
  const resources: Record<string, unknown> = {
    EndpointGroup: {
      Type: 'AWS::EC2::SecurityGroup', Properties: {
        GroupName: 'studiostack-secretsmanager-vpce-sg', GroupDescription: 'HTTPS to Secrets Manager from database Lambdas only', VpcId: vpc,
        SecurityGroupIngress: environments.map(env => ({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443, SourceSecurityGroupId: env.group, Description: `${env.name} database Lambda HTTPS` })),
        // An explicit non-routable rule suppresses AWS's default allow-all egress.
        SecurityGroupEgress: [{ IpProtocol: '-1', CidrIp: '127.0.0.1/32', Description: 'No externally routable initiated connections' }],
      },
    },
  }
  const statements: unknown[] = []
  const outputs: Record<string, unknown> = { EndpointId: { Value: ref('SecretsEndpoint') }, EndpointGroupId: { Value: ref('EndpointGroup') } }
  for (const env of environments) {
    const setupAllowed = typeof includeSetup === 'boolean' ? includeSetup : includeSetup.includes(env.name)
    const secret = `${env.logical}Secret`
    const role = `${env.logical}Role`
    const runtimeName = `studiostack-${env.name}-database`
    const setupName = `studiostack-${env.name}-database-setup`
    resources[secret] = {
      Type: 'AWS::SecretsManager::Secret', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
      Properties: { Name: `studiostack/${env.name}/database-app`, Description: `${env.name} restricted PostgreSQL app login`,
        GenerateSecretString: { SecretStringTemplate: JSON.stringify({ username: `studiostack_${env.name}_app` }), GenerateStringKey: 'password', PasswordLength: 48, ExcludePunctuation: true } },
    }
    resources[role] = { Type: 'AWS::IAM::Role', Properties: {
      RoleName: `${runtimeName}-role`, AssumeRolePolicyDocument: trust,
      Policies: [{ PolicyName: 'private-database-runtime', PolicyDocument: executionPolicy(runtimeName, [ref(secret)]) }],
    } }
    for (const name of [runtimeName, setupName]) {
      resources[`${env.logical}${name === runtimeName ? 'Runtime' : 'Setup'}Log`] = {
        Type: 'AWS::Logs::LogGroup', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain',
        Properties: { LogGroupName: `/aws/lambda/${name}`, RetentionInDays: 14 },
      }
    }
    resources[`${env.logical}HttpsEgress`] = { Type: 'AWS::EC2::SecurityGroupEgress', Properties: {
      GroupId: env.group, IpProtocol: 'tcp', FromPort: 443, ToPort: 443, DestinationSecurityGroupId: ref('EndpointGroup'), Description: 'Private Secrets Manager HTTPS only',
    } }
    statements.push({ Effect: 'Allow', Principal: '*', Action: 'secretsmanager:GetSecretValue', Resource: ref(secret),
      Condition: { ArnEquals: { 'aws:PrincipalArn': setupAllowed ? [attr(role, 'Arn'), roleArn(`${setupName}-role`)] : [attr(role, 'Arn')] } } })
    if (setupAllowed) statements.push({ Effect: 'Allow', Principal: '*', Action: 'secretsmanager:GetSecretValue', Resource: masterSecrets[env.name],
      Condition: { ArnEquals: { 'aws:PrincipalArn': roleArn(`${setupName}-role`) } } })
    outputs[`${env.logical}SecretArn`] = { Value: ref(secret) }
    outputs[`${env.logical}RoleArn`] = { Value: attr(role, 'Arn') }
  }
  resources.SecretsEndpoint = { Type: 'AWS::EC2::VPCEndpoint', Properties: {
    VpcId: vpc, VpcEndpointType: 'Interface', ServiceName: `com.amazonaws.${region}.secretsmanager`, PrivateDnsEnabled: true,
    SubnetIds: subnets, SecurityGroupIds: [ref('EndpointGroup')], PolicyDocument: { Version: '2012-10-17', Statement: statements },
    Tags: [{ Key: 'Name', Value: 'studiostack-secretsmanager-vpce' }],
  } }
  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'StudioStack private database connection infrastructure; no database replacement or schema migrations', Resources: resources, Outputs: outputs }
}
