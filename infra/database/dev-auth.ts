import {studioStackPasswordPolicy,studioStackAccountRecovery} from './auth-policy'
import { account, region } from './resources'

/** Dev only. Email-verified signup; no client secret, SMS or production changes. */
export function devAuthInfrastructure(origin='https://dev.dvmmztb0u3m9g.amplifyapp.com') {
  if(new URL(origin).protocol!=='https:'||new URL(origin).origin!==origin)throw new Error('An explicit HTTPS development website origin is required')
  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'StudioStack development user authentication', Resources: {
    Pool: { Type: 'AWS::Cognito::UserPool', Properties: { UserPoolName: 'studiostack-dev-users', UserPoolTier: 'LITE', AdminCreateUserConfig: { AllowAdminCreateUserOnly: false,InviteMessageTemplate:{EmailSubject:'Your StudioStack invitation',EmailMessage:`You have been invited to StudioStack. Sign in at ${origin}/login/ with username {username} and temporary password {####}. Choose your own password, verify your email and accept your organization invitation. If you did not expect this invitation, ignore this message.`} },
      AutoVerifiedAttributes:['email'],
      AccountRecoverySetting:studioStackAccountRecovery,
      Policies: { PasswordPolicy:studioStackPasswordPolicy }, MfaConfiguration: 'OFF', UserPoolTags: { ManagedBy: 'StudioStack', Environment: 'dev' } } },
    ResourceServer: { Type: 'AWS::Cognito::UserPoolResourceServer', Properties: { UserPoolId: { Ref: 'Pool' }, Identifier: 'studiostack-api', Name: 'StudioStack API', Scopes: [{ ScopeName: 'access', ScopeDescription: 'Authenticated StudioStack API access; organization permissions enforced by database membership' }] } },
    Client: { Type: 'AWS::Cognito::UserPoolClient', DependsOn: 'ResourceServer', Properties: { UserPoolId: { Ref: 'Pool' }, ClientName: 'studiostack-dev-web', GenerateSecret: false,
      AllowedOAuthFlowsUserPoolClient: true, AllowedOAuthFlows: ['code'], AllowedOAuthScopes: ['openid', 'profile', 'email', 'aws.cognito.signin.user.admin', 'studiostack-api/access'], SupportedIdentityProviders: ['COGNITO'],
      CallbackURLs: ['http://localhost:5174/login/', 'http://localhost:5417/callback',`${origin}/login/`], LogoutURLs: ['http://localhost:5174/',`${origin}/`], PreventUserExistenceErrors: 'ENABLED', EnableTokenRevocation: true,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'], AccessTokenValidity: 15, IdTokenValidity: 15, RefreshTokenValidity: 1, TokenValidityUnits: { AccessToken: 'minutes', IdToken: 'minutes', RefreshToken: 'days' } } },
    Domain: { Type: 'AWS::Cognito::UserPoolDomain', Properties: { UserPoolId: { Ref: 'Pool' }, Domain: `studiostack-dev-${account}`, ManagedLoginVersion: 1 } },
  }, Outputs: { UserPoolId: { Value: { Ref: 'Pool' } }, AppClientId: { Value: { Ref: 'Client' } }, Issuer: { Value: { 'Fn::Join': ['', [`https://cognito-idp.${region}.amazonaws.com/`, { Ref: 'Pool' }]] } }, Domain: { Value: `https://studiostack-dev-${account}.auth.${region}.amazoncognito.com` } } }
}
