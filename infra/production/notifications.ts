import { account, region, functionArn, trust } from '../database/resources'
export interface NotificationStackOptions { environment: 'dev' | 'prod'; artifactBucket: string; artifactKey: string; sender: string; identity: string; webUrl: string; userPoolId: string; enabled?: boolean }
export function productionNotificationInfrastructure(input: NotificationStackOptions) {
  const { environment: env, artifactBucket, artifactKey, sender, identity, webUrl, userPoolId } = input
  if (!['dev','prod'].includes(env) || artifactBucket !== `studio-stack-photos-${env}` || !artifactKey.startsWith('deployments/production/') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) || !/^[a-zA-Z0-9@._-]+$/.test(identity) || new URL(webUrl).protocol !== 'https:' || !/^us-east-2_[a-zA-Z0-9]+$/.test(userPoolId)) throw new Error('Explicit environment, private artifact, verified sender and HTTPS website required')
  if (identity !== sender && !sender.endsWith(`@${identity}`)) throw new Error('SES identity must match the sender address or domain')
  const name = `studiostack-${env}-production-notifications`, fn = functionArn(name)
  return { AWSTemplateFormatVersion:'2010-09-09',Description:'StudioStack production decisions: scheduled, IAM-scoped SES delivery',Resources:{
    Logs:{Type:'AWS::Logs::LogGroup',Properties:{LogGroupName:`/aws/lambda/${name}`,RetentionInDays:14}},
    Role:{Type:'AWS::IAM::Role',Properties:{RoleName:`${name}-role`,AssumeRolePolicyDocument:trust,Policies:[{PolicyName:'production-decision-delivery',PolicyDocument:{Version:'2012-10-17',Statement:[
      {Effect:'Allow',Action:['logs:CreateLogStream','logs:PutLogEvents'],Resource:`arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${name}:*`},
      {Effect:'Allow',Action:['lambda:InvokeFunction'],Resource:functionArn(`studiostack-${env}-database`)},
      {Effect:'Allow',Action:['cognito-idp:ListUsers','cognito-idp:AdminGetUser'],Resource:`arn:aws:cognito-idp:${region}:${account}:userpool/${userPoolId}`},
      {Effect:'Allow',Action:['ses:SendEmail'],Resource:`arn:aws:ses:${region}:${account}:identity/${identity}`,Condition:{StringEquals:{'ses:FromAddress':sender}}},
    ]}}]}},
    Sender:{Type:'AWS::Lambda::Function',DependsOn:'Logs',Properties:{FunctionName:name,Role:{'Fn::GetAtt':['Role','Arn']},Runtime:'nodejs24.x',Architectures:['arm64'],Handler:'index.handler',MemorySize:256,Timeout:120,Code:{S3Bucket:artifactBucket,S3Key:artifactKey},Environment:{Variables:{STUDIOSTACK_ENV:env,PRODUCTION_OUTBOX_FUNCTION:`studiostack-${env}-database`,PRODUCTION_EMAIL_FROM:sender,PRODUCTION_WEB_URL:webUrl,COGNITO_USER_POOL_ID:userPoolId}},Tags:[{Key:'ManagedBy',Value:'StudioStack'},{Key:'Environment',Value:env}]}},
    DecisionSignalPermission:{Type:'AWS::Lambda::Permission',Properties:{FunctionName:{Ref:'Sender'},Action:'lambda:InvokeFunction',Principal:`logs.${region}.amazonaws.com`,SourceAccount:account,SourceArn:`arn:aws:logs:${region}:${account}:log-group:/aws/lambda/studiostack-${env}-database:*`}},
    DecisionSignal:{Type:'AWS::Logs::SubscriptionFilter',DependsOn:'DecisionSignalPermission',Properties:{DestinationArn:fn,FilterPattern:'{ $.type = "production-decision-queued" || $.type = "app-alert-queued" }',LogGroupName:`/aws/lambda/studiostack-${env}-database`}},
    Schedule:{Type:'AWS::Events::Rule',Properties:{Name:`${name}-schedule`,ScheduleExpression:env==='dev'?'rate(1 hour)':'rate(5 minutes)',State:input.enabled?'ENABLED':'DISABLED',Targets:[{Id:'DecisionSender',Arn:fn,RetryPolicy:{MaximumRetryAttempts:0,MaximumEventAgeInSeconds:300}}]}},
    SchedulePermission:{Type:'AWS::Lambda::Permission',Properties:{FunctionName:{Ref:'Sender'},Action:'lambda:InvokeFunction',Principal:'events.amazonaws.com',SourceAccount:account,SourceArn:{'Fn::GetAtt':['Schedule','Arn']}}},
    DeliveryErrors:{Type:'AWS::Logs::MetricFilter',Properties:{LogGroupName:{Ref:'Logs'},FilterPattern:'{ $.failed > 0 }',MetricTransformations:[{MetricNamespace:'StudioStack/Production',MetricName:`${env}-DeliveryFailures`,MetricValue:'$.failed',DefaultValue:0}]}},
    ErrorAlarm:{Type:'AWS::CloudWatch::Alarm',Properties:{AlarmName:`${name}-errors`,Namespace:'AWS/Lambda',MetricName:'Errors',Dimensions:[{Name:'FunctionName',Value:name}],Statistic:'Sum',Period:300,EvaluationPeriods:1,Threshold:1,ComparisonOperator:'GreaterThanOrEqualToThreshold',TreatMissingData:'notBreaching'}},
    DeliveryAlarm:{Type:'AWS::CloudWatch::Alarm',Properties:{AlarmName:`${name}-delivery-failures`,Namespace:'StudioStack/Production',MetricName:`${env}-DeliveryFailures`,Statistic:'Sum',Period:3600,EvaluationPeriods:1,Threshold:1,ComparisonOperator:'GreaterThanOrEqualToThreshold',TreatMissingData:'notBreaching'}},
  },Outputs:{SenderFunction:{Value:{Ref:'Sender'}},ScheduleName:{Value:{Ref:'Schedule'}}} }
}
