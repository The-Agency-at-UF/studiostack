import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {object,pagination,uuid} from '../database/api-validation'
const prefix='/organizations/{organizationId}/alerts'
export const alertRoutes=['GET '+prefix,'GET '+prefix+'/preferences','PATCH '+prefix+'/preferences','POST '+prefix+'/{alertId}/read']
export interface AlertRequest {operation:'alerts';organizationId:string;method:string;resource:'list'|'preferences'|'read';alertId?:string;body?:unknown;page:{limit:number;after:string|null}}
export function alertRequest(e:APIGatewayProxyEventV2WithJWTAuthorizer,json:()=>unknown):AlertRequest{const method=e.requestContext.http.method,resource=e.routeKey.endsWith('/preferences')?'preferences':e.routeKey.endsWith('/read')?'read':'list';if(method!=='GET'||resource==='preferences')object(e.queryStringParameters??{},[]);return {operation:'alerts',organizationId:uuid(e.pathParameters?.organizationId),method,resource,...(e.pathParameters?.alertId?{alertId:uuid(e.pathParameters.alertId)}:{}),...(method!=='GET'?{body:json()}:{}),page:resource==='list'?pagination(e.queryStringParameters??{}):{limit:100,after:null}}}
