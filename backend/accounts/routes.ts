import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {object,pagination,uuid} from '../database/api-validation'
import type {Page} from '../database/api-repository'
export interface AccountRequest {operation:'accounts'; organizationId:string; resource:string; method:string; memberId?:string; teamId?:string; body?:unknown; page:Page}
const prefix='/organizations/{organizationId}/administration'
export const accountRoutes=[
  `GET ${prefix}/settings`,`PATCH ${prefix}/settings`,
  `GET ${prefix}/members`,`PATCH ${prefix}/members/{memberId}`,
  `GET ${prefix}/teams`,`POST ${prefix}/teams`,`PATCH ${prefix}/teams/{teamId}`,
  `GET ${prefix}/activity`,
]
export function accountRequest(event:APIGatewayProxyEventV2WithJWTAuthorizer,body:()=>unknown):AccountRequest {
  const method=event.requestContext.http.method,resource=event.routeKey.split(' ')[1].slice(prefix.length).split('/')[1]
  if(method!=='GET')object(event.queryStringParameters??{},[])
  return {operation:'accounts',organizationId:uuid(event.pathParameters?.organizationId),resource,method,page:method==='GET'?pagination(event.queryStringParameters??{}):{limit:100,after:null},
    ...(event.pathParameters?.memberId?{memberId:uuid(event.pathParameters.memberId)}:{}),...(event.pathParameters?.teamId?{teamId:uuid(event.pathParameters.teamId)}:{}),...(['POST','PATCH'].includes(method)?{body:body()}:{}),}
}
