import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {object,pagination,uuid} from '../database/api-validation'
const prefix='/organizations/{organizationId}/equipment/reports'
export const reportRoutes=['GET '+prefix,'POST '+prefix,'GET '+prefix+'/{reportId}','PATCH '+prefix+'/{reportId}','GET '+prefix+'/{reportId}/activity','POST '+prefix+'/{reportId}/activity']
export interface ReportRequest {operation:'reports';organizationId:string;method:string;reportId?:string;activity:boolean;body?:unknown;page:{limit:number;after:string|null}}
export function reportRequest(event:APIGatewayProxyEventV2WithJWTAuthorizer,json:()=>unknown):ReportRequest{const method=event.requestContext.http.method;if(method!=='GET')object(event.queryStringParameters??{},[]);return {operation:'reports',organizationId:uuid(event.pathParameters?.organizationId),method,activity:event.routeKey.endsWith('/activity'),...(event.pathParameters?.reportId?{reportId:uuid(event.pathParameters.reportId)}:{}),...(method!=='GET'?{body:json()}:{}),page:method==='GET'?pagination(event.queryStringParameters??{}):{limit:100,after:null}}}
