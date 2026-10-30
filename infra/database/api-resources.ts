import {alertRoutes} from '../../backend/alerts/routes'
import {reportRoutes} from '../../backend/equipment/report-routes'
import {equipmentRoutes} from '../../backend/equipment/routes'
import { productionRoutes,agencyProductionRoutes } from '../../backend/production/routes'
import {accountRoutes} from '../../backend/accounts/routes'
import { account, region } from './resources'
import { databaseApiRoutes, privatePhotoRoutes, bugReportRoutes, databaseApiScope, apiConfiguration } from '../../backend/database/api'

/** Additive API stack: no new database, secret, VPC endpoint or execution role. */
export function databaseApiInfrastructure(env: Record<string, string | undefined>, includePhotos = false) {
  const config = apiConfiguration(env)
  const functionName = `studiostack-${env.STUDIOSTACK_ENV}-database`
  const functionArn = `arn:aws:lambda:${region}:${account}:function:${functionName}`
  const Resources: Record<string, unknown> = {
    Authorizer: { Type: 'AWS::ApiGatewayV2::Authorizer', Properties: {
      ApiId: config.apiId, AuthorizerType: 'JWT', IdentitySource: ['$request.header.Authorization'],
      Name: `studiostack-${env.STUDIOSTACK_ENV}-database-jwt`, JwtConfiguration: { Issuer: config.issuer, Audience: [config.clientId] },
    } },
    Integration: { Type: 'AWS::ApiGatewayV2::Integration', Properties: {
      ApiId: config.apiId, IntegrationType: 'AWS_PROXY', IntegrationUri: functionArn, IntegrationMethod: 'POST', PayloadFormatVersion: '2.0', TimeoutInMillis: 29_000,
    } },
  }
  for (const [index, route] of [...databaseApiRoutes, ...(includePhotos ? privatePhotoRoutes : []), ...productionRoutes.filter(route=>!agencyProductionRoutes.includes(route)), ...accountRoutes, ...equipmentRoutes, ...reportRoutes, ...alertRoutes,...agencyProductionRoutes,...bugReportRoutes].entries()) {
    // The upload route predates this stack. Deployment updates it in place,
    // avoiding duplicate routes or deleting the existing AWS resource.
    if (route !== 'POST /photos/uploads') {
    Resources[`Route${index}`] = { Type: 'AWS::ApiGatewayV2::Route', Properties: {
      ApiId: config.apiId, RouteKey: route, AuthorizationType: 'JWT', AuthorizerId: { Ref: 'Authorizer' }, AuthorizationScopes: [databaseApiScope],
      Target: { 'Fn::Join': ['/', ['integrations', { Ref: 'Integration' }]] },
    } }
    }
  }
  // One service permission for this exact account/API avoids Lambda's 20 KiB
  // resource-policy limit. Every route still uses JWT/scopes; the handler also
  // checks issuer, client, token use, API identity and the exact route allowlist.
  Resources.ApiInvokePermission={Type:'AWS::Lambda::Permission',Properties:{FunctionName:functionName,Action:'lambda:InvokeFunction',Principal:'apigateway.amazonaws.com',SourceAccount:account,SourceArn:`arn:aws:execute-api:${region}:${account}:${config.apiId}/*/*/*`}}

  return { AWSTemplateFormatVersion: '2010-09-09', Description: 'StudioStack JWT-protected database API routes', Resources,
    Outputs: { AuthorizerId: { Value: { Ref: 'Authorizer' } }, IntegrationId: { Value: { Ref: 'Integration' } } } }
}
