import {account,region,functionArn,trust} from '../database/resources'
import {apiConfiguration,databaseApiScope} from '../../backend/database/api'
export function accountInfrastructure(input:{environment:'dev'|'prod';artifactBucket:string;artifactKey:string;pool:string;client:string;apiId:string;authorizerId:string;sender:string;webUrl:string;configurationSet?:string}) {
  const {environment:env,pool,client,apiId,authorizerId,sender,webUrl}=input
  apiConfiguration({STUDIOSTACK_ENV:env,DATABASE_API_ID:apiId,COGNITO_USER_POOL_ID:pool,COGNITO_APP_CLIENT_ID:client})
  if(input.artifactBucket!==`studio-stack-photos-${env}`||!input.artifactKey.startsWith('deployments/accounts/')||!/^\w+$/.test(authorizerId)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender)||new URL(webUrl).protocol!=='https:')throw new Error('Explicit account delivery configuration required')
  if(input.configurationSet&&input.configurationSet!==`studiostack-${env}-delivery`)throw new Error('Unexpected SES configuration set')
  const name=`studiostack-${env}-accounts`,arn=functionArn(name),backend=`studiostack-${env}-database`,log=`/aws/lambda/${name}`
  const resources:Record<string,unknown>={
    Logs:{Type:'AWS::Logs::LogGroup',Properties:{LogGroupName:log,RetentionInDays:14}},
    Role:{Type:'AWS::IAM::Role',Properties:{RoleName:`${name}-role`,AssumeRolePolicyDocument:trust,Policies:[{PolicyName:'account-invitations',PolicyDocument:{Version:'2012-10-17',Statement:[
      {Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:`arn:aws:logs:${region}:${account}:log-group:${log}:*`},
      {Effect:'Allow',Action:['lambda:InvokeFunction'],Resource:functionArn(backend)},
      {Effect:'Allow',Action:['cognito-idp:AdminCreateUser','cognito-idp:AdminGetUser','cognito-idp:ListUsers'],Resource:`arn:aws:cognito-idp:${region}:${account}:userpool/${pool}`},
      {Effect:'Allow',Action:['ses:SendEmail'],Resource:input.configurationSet?[`arn:aws:ses:${region}:${account}:identity/${sender}`,`arn:aws:ses:${region}:${account}:configuration-set/${input.configurationSet}`]:`arn:aws:ses:${region}:${account}:identity/${sender}`,Condition:{StringEquals:{'ses:FromAddress':sender}}},
    ]}}]}},
    Worker:{Type:'AWS::Lambda::Function',DependsOn:'Logs',Properties:{FunctionName:name,Role:{'Fn::GetAtt':['Role','Arn']},Runtime:'nodejs24.x',Architectures:['arm64'],Handler:'index.handler',MemorySize:256,Timeout:120,Code:{S3Bucket:input.artifactBucket,S3Key:input.artifactKey},Environment:{Variables:{STUDIOSTACK_ENV:env,DATABASE_API_ID:apiId,COGNITO_USER_POOL_ID:pool,COGNITO_APP_CLIENT_ID:client,PRODUCTION_OUTBOX_FUNCTION:backend,PRODUCTION_EMAIL_FROM:sender,PRODUCTION_WEB_URL:webUrl,...(input.configurationSet?{SES_CONFIGURATION_SET:input.configurationSet}:{})}},Tags:[{Key:'ManagedBy',Value:'StudioStack'},{Key:'Environment',Value:env}]}},
    Integration:{Type:'AWS::ApiGatewayV2::Integration',Properties:{ApiId:apiId,IntegrationType:'AWS_PROXY',IntegrationUri:arn,IntegrationMethod:'POST',PayloadFormatVersion:'2.0',TimeoutInMillis:29000}},
    SignalPermission:{Type:'AWS::Lambda::Permission',Properties:{FunctionName:{Ref:'Worker'},Action:'lambda:InvokeFunction',Principal:`logs.${region}.amazonaws.com`,SourceAccount:account,SourceArn:`arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${backend}:*`}},
    Signal:{Type:'AWS::Logs::SubscriptionFilter',DependsOn:'SignalPermission',Properties:{DestinationArn:arn,FilterPattern:'{ $.type = "account-invitation-queued" }',LogGroupName:`/aws/lambda/${backend}`}},
    Recovery:{Type:'AWS::Events::Rule',Properties:{Name:`${name}-recovery`,ScheduleExpression:env==='dev'?'rate(1 hour)':'rate(5 minutes)',State:'ENABLED',Targets:[{Id:'InviteDelivery',Arn:arn,RetryPolicy:{MaximumRetryAttempts:0,MaximumEventAgeInSeconds:300}}]}},
    RecoveryPermission:{Type:'AWS::Lambda::Permission',Properties:{FunctionName:{Ref:'Worker'},Action:'lambda:InvokeFunction',Principal:'events.amazonaws.com',SourceAccount:account,SourceArn:{'Fn::GetAtt':['Recovery','Arn']}}},
    ErrorAlarm:{Type:'AWS::CloudWatch::Alarm',Properties:{AlarmName:`${name}-errors`,Namespace:'AWS/Lambda',MetricName:'Errors',Dimensions:[{Name:'FunctionName',Value:name}],Statistic:'Sum',Period:300,EvaluationPeriods:1,Threshold:1,ComparisonOperator:'GreaterThanOrEqualToThreshold',TreatMissingData:'notBreaching'}},
  }
  for(const [i,route] of ['GET /account/invitations','POST /account/invitations/{invitationId}/accept'].entries()) {
    resources[`Route${i}`]={Type:'AWS::ApiGatewayV2::Route',Properties:{ApiId:apiId,RouteKey:route,AuthorizationType:'JWT',AuthorizerId:authorizerId,AuthorizationScopes:[databaseApiScope],Target:{'Fn::Join':['',['integrations/',{Ref:'Integration'}]]}}}
    const [method,path]=route.split(' ');resources[`Permission${i}`]={Type:'AWS::Lambda::Permission',Properties:{FunctionName:{Ref:'Worker'},Action:'lambda:InvokeFunction',Principal:'apigateway.amazonaws.com',SourceAccount:account,SourceArn:`arn:aws:execute-api:${region}:${account}:${apiId}/*/${method}${path.replace(/\{[^}]+\}/g,'*')}`}}
  }
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'Scoped StudioStack account invitation delivery and verified recipient acceptance',Resources:resources,Outputs:{Worker:{Value:{Ref:'Worker'}}}}
}
