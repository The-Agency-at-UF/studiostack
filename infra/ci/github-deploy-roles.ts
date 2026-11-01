import {account,region} from '../database/resources'
import {webTargets,type WebEnvironment} from '../../scripts/publish-web'

export const githubRepository='The-Agency-at-UF/studiostack'
export const githubEnvironments:Record<WebEnvironment,string>={dev:'development',prod:'production'}
export const deployRoleName=(environment:WebEnvironment)=>`studiostack-ci-${environment}-web`
const provider=`arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`

/** GitHub OIDC trust plus one publish-only role per environment. A role can be
 * assumed only by a job in this repository's matching GitHub environment, and can
 * only publish to that environment's Amplify app. */
export function githubDeployRoles(createProvider:boolean){
  const Resources:Record<string,unknown>=createProvider?{Provider:{Type:'AWS::IAM::OIDCProvider',Properties:{Url:'https://token.actions.githubusercontent.com',ClientIdList:['sts.amazonaws.com']}}}:{}
  for(const environment of Object.keys(webTargets) as WebEnvironment[]){
    const app=`arn:aws:amplify:${region}:${account}:apps/${webTargets[environment].appId}`
    Resources[`${environment==='dev'?'Dev':'Prod'}WebRole`]={Type:'AWS::IAM::Role',...(createProvider?{DependsOn:'Provider'}:{}),Properties:{
      RoleName:deployRoleName(environment),MaxSessionDuration:3600,
      Description:`GitHub Actions publishes the ${environment} StudioStack website`,
      AssumeRolePolicyDocument:{Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:{Federated:provider},Action:'sts:AssumeRoleWithWebIdentity',
        Condition:{StringEquals:{'token.actions.githubusercontent.com:aud':'sts.amazonaws.com','token.actions.githubusercontent.com:sub':`repo:${githubRepository}:environment:${githubEnvironments[environment]}`}}}]},
      Policies:[{PolicyName:'publish-web-only',PolicyDocument:{Version:'2012-10-17',Statement:[
        {Effect:'Allow',Action:['amplify:GetApp','amplify:CreateDeployment','amplify:StartDeployment','amplify:GetJob'],Resource:[app,`${app}/*`]}]}}],
      Tags:[{Key:'ManagedBy',Value:'StudioStack'},{Key:'Environment',Value:environment}]}}
  }
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'StudioStack GitHub Actions deploy roles (publish-only)',Resources,
    Outputs:{DevWebRoleArn:{Value:{'Fn::GetAtt':['DevWebRole','Arn']}},ProdWebRoleArn:{Value:{'Fn::GetAtt':['ProdWebRole','Arn']}}}}
}
