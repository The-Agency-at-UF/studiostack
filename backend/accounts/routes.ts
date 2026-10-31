import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {object,pagination,uuid} from '../database/api-validation'
import type {Page} from '../database/api-repository'
export interface AccountRequest {operation:'accounts'; organizationId:string; resource:string; method:string; memberId?:string; teamId?:string; invitationId?:string; action?:string; body?:unknown; page:Page}
const prefix='/organizations/{organizationId}/administration'
export const accountRoutes=[
  `GET ${prefix}/settings`,`PATCH ${prefix}/settings`,
  `GET ${prefix}/members`,`PATCH ${prefix}/members/{memberId}`,
  `GET ${prefix}/teams`,`POST ${prefix}/teams`,`PATCH ${prefix}/teams/{teamId}`,
  `GET ${prefix}/activity`,
  `GET ${prefix}/invitations`,`POST ${prefix}/invitations`,`POST ${prefix}/invitations/{invitationId}/revoke`,`POST ${prefix}/invitations/{invitationId}/retry`,
]
/** Routes for the signed-in account itself, answered by the verified directory worker. */
export const directoryRoutes=[
  'GET /account/invitations','POST /account/invitations/{invitationId}/accept',
  'GET /account/onboarding','POST /account/onboarding/domain-joins','POST /account/onboarding/code-joins',
  'POST /account/onboarding/access-requests','POST /account/onboarding/access-requests/{requestId}/withdraw',
]
export function accountRequest(event:APIGatewayProxyEventV2WithJWTAuthorizer,body:()=>unknown):AccountRequest {
  const method=event.requestContext.http.method,resource=event.routeKey.split(' ')[1].slice(prefix.length).split('/')[1]
  if(method!=='GET')object(event.queryStringParameters??{},[])
  return {operation:'accounts',organizationId:uuid(event.pathParameters?.organizationId),resource,method,page:method==='GET'?pagination(event.queryStringParameters??{}):{limit:100,after:null},
    ...(event.pathParameters?.memberId?{memberId:uuid(event.pathParameters.memberId)}:{}),...(event.pathParameters?.teamId?{teamId:uuid(event.pathParameters.teamId)}:{}),
    ...(event.pathParameters?.invitationId?{invitationId:uuid(event.pathParameters.invitationId),action:event.routeKey.split('/').at(-1)}:{}),...(['POST','PATCH'].includes(method)?{body:body()}:{}),}
}
