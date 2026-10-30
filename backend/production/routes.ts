import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { object, pagination, uuid } from '../database/api-validation'
import type { ProductionRequest } from './repository'
const prefix = '/organizations/{organizationId}/production'
export const productionRoutes = [
  `GET ${prefix}/access`, `GET ${prefix}/settings`, `PATCH ${prefix}/settings`,
  `GET ${prefix}/briefs`, `POST ${prefix}/briefs`, `GET ${prefix}/briefs/{briefId}`, `PATCH ${prefix}/briefs/{briefId}`,
  `POST ${prefix}/briefs/{briefId}/actions`,
]
export function productionRequest(event: APIGatewayProxyEventV2WithJWTAuthorizer, body: () => unknown): ProductionRequest {
  const method = event.requestContext.http.method, path = event.routeKey.split(' ')[1].slice(prefix.length).split('/').filter(Boolean)
  const resource = path.includes('actions') ? 'actions' : path.includes('attachments') ? 'attachments' : path[0]
  const page = method === 'GET' && ['briefs', 'deliveries'].includes(resource) && !event.pathParameters?.briefId ? pagination(event.queryStringParameters ?? {}) : { limit: 100, after: null }
  if (!(method === 'GET' && !event.pathParameters?.briefId && ['briefs', 'deliveries'].includes(resource))) object(event.queryStringParameters ?? {}, [])
  return { operation: 'production', organizationId: uuid(event.pathParameters?.organizationId), resource, method, page,
    ...(event.pathParameters?.briefId ? { briefId: uuid(event.pathParameters.briefId) } : {}), ...(event.pathParameters?.attachmentId ? { attachmentId: uuid(event.pathParameters.attachmentId) } : {}),
    ...(event.pathParameters?.deliveryId ? { deliveryId: uuid(event.pathParameters.deliveryId) } : {}), ...(['POST', 'PATCH'].includes(method) ? { body: body() } : {}) }
}
