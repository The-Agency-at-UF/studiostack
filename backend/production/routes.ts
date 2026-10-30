import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { object, pagination, uuid } from '../database/api-validation'
import type { ProductionRequest } from './repository'
const prefix = '/organizations/{organizationId}/production'
export const agencyProductionRoutes=[`GET ${prefix}/people`,`GET ${prefix}/clients`,`POST ${prefix}/clients`,`PATCH ${prefix}/clients/{clientId}`]
export const productionRoutes = [
  `GET ${prefix}/access`, `GET ${prefix}/settings`, `PATCH ${prefix}/settings`,
  `GET ${prefix}/briefs`, `POST ${prefix}/briefs`, `GET ${prefix}/briefs/{briefId}`, `PATCH ${prefix}/briefs/{briefId}`,
  `POST ${prefix}/briefs/{briefId}/actions`,
  `POST ${prefix}/briefs/{briefId}/attachments`, `POST ${prefix}/briefs/{briefId}/attachments/{attachmentId}/complete`,
  `GET ${prefix}/briefs/{briefId}/attachments/{attachmentId}`, `DELETE ${prefix}/briefs/{briefId}/attachments/{attachmentId}`,
  `GET ${prefix}/deliveries`, `POST ${prefix}/deliveries/{deliveryId}/retry`,...agencyProductionRoutes,
]
export function productionRequest(event: APIGatewayProxyEventV2WithJWTAuthorizer, body: () => unknown): ProductionRequest {
  const method = event.requestContext.http.method, path = event.routeKey.split(' ')[1].slice(prefix.length).split('/').filter(Boolean)
  const resource = path.includes('actions') ? 'actions' : path.includes('attachments') ? 'attachments' : path[0]
  const page = method === 'GET' && ['briefs', 'deliveries','clients','people'].includes(resource) && !event.pathParameters?.briefId ? pagination(event.queryStringParameters ?? {}) : { limit: 100, after: null }
  if (!(method === 'GET' && !event.pathParameters?.briefId && ['briefs', 'deliveries','clients','people'].includes(resource))) object(event.queryStringParameters ?? {}, [])
  return { operation: 'production', organizationId: uuid(event.pathParameters?.organizationId), resource, method, page,
    ...(event.pathParameters?.clientId ? {clientId:uuid(event.pathParameters.clientId)} : {}),
    ...(event.pathParameters?.briefId ? { briefId: uuid(event.pathParameters.briefId) } : {}), ...(event.pathParameters?.attachmentId ? { attachmentId: uuid(event.pathParameters.attachmentId) } : {}),
    ...(event.pathParameters?.deliveryId ? { deliveryId: uuid(event.pathParameters.deliveryId) } : {}), ...(['POST', 'PATCH'].includes(method) ? { body: body() } : {}) }
}
