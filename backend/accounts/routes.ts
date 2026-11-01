import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {object,pagination,text,uuid} from '../database/api-validation'
import type {Page} from '../database/api-repository'
export interface AccountRequest {operation:'accounts'; organizationId:string; resource:string; method:string; memberId?:string; invitationId?:string; domain?:string; codeId?:string; accessRequestId?:string; action?:string; body?:unknown; page:Page}
const prefix='/organizations/{organizationId}/administration'
// Deployed route IDs follow list order, so the infrastructure appends this newer route last.
export const organizationDirectoryRoute=`GET ${prefix}/directory`
export const accountRoutes=[
  `GET ${prefix}/settings`,`PATCH ${prefix}/settings`,
  `GET ${prefix}/members`,`PATCH ${prefix}/members/{memberId}`,
  `GET ${prefix}/teams`,`POST ${prefix}/teams`,`PATCH ${prefix}/teams/{teamId}`,
  `GET ${prefix}/activity`,
  `GET ${prefix}/invitations`,`POST ${prefix}/invitations`,`POST ${prefix}/invitations/{invitationId}/revoke`,`POST ${prefix}/invitations/{invitationId}/retry`,
  organizationDirectoryRoute,
]
/** Deployed after every earlier route so existing API Gateway route IDs stay stable. */
export const joinMethodRoutes=[
  `GET ${prefix}/domains`,`POST ${prefix}/domains`,`PATCH ${prefix}/domains/{domain}`,`POST ${prefix}/domains/{domain}/remove`,
  `GET ${prefix}/join-codes`,`POST ${prefix}/join-codes`,`POST ${prefix}/join-codes/{codeId}/revoke`,
  `GET ${prefix}/access-requests`,`POST ${prefix}/access-requests/{accessRequestId}/approve`,`POST ${prefix}/access-requests/{accessRequestId}/deny`,
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
    ...(event.pathParameters?.memberId?{memberId:uuid(event.pathParameters.memberId)}:{}),
    ...(event.pathParameters?.invitationId?{invitationId:uuid(event.pathParameters.invitationId),action:event.routeKey.split('/').at(-1)}:{}),
    ...(event.pathParameters?.domain?{domain:text(event.pathParameters.domain,253).toLowerCase(),action:method==='PATCH'?'update':event.routeKey.split('/').at(-1)}:{}),
    ...(event.pathParameters?.codeId?{codeId:uuid(event.pathParameters.codeId),action:event.routeKey.split('/').at(-1)}:{}),
    ...(event.pathParameters?.accessRequestId?{accessRequestId:uuid(event.pathParameters.accessRequestId),action:event.routeKey.split('/').at(-1)}:{}),...(['POST','PATCH'].includes(method)?{body:body()}:{}),}
}
