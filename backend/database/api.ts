import {alertRoutes,alertRequest} from '../alerts/routes'
import {reportRoutes,reportRequest} from '../equipment/report-routes'
import {equipmentRoutes,equipmentRequest} from '../equipment/routes'
import { productionRoutes, productionRequest } from '../production/routes'
import {accountRoutes,accountRequest} from '../accounts/routes'
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import type { createApiRepository, ApiRequest, Identity } from './api-repository'
import { ApiError, createEquipment, updateEquipment, createReservation, createPhotoUpload, pagination, uuid, object, text } from './api-validation'

export const databaseApiRoutes = [
  'GET /me', 'POST /me', 'GET /organizations',
  'GET /organizations/{organizationId}/members',
  'GET /organizations/{organizationId}/groups', 'POST /organizations/{organizationId}/groups',
  'GET /organizations/{organizationId}/inventory', 'POST /organizations/{organizationId}/inventory',
  'PATCH /organizations/{organizationId}/inventory/{itemId}',
  'GET /organizations/{organizationId}/reservations', 'POST /organizations/{organizationId}/reservations',
  'GET /organizations/{organizationId}/reservations/{reservationId}',
  'POST /organizations/{organizationId}/reservations/{reservationId}/cancel',
] as const
export const privatePhotoRoutes = ['POST /photos/uploads', 'POST /organizations/{organizationId}/photos/{photoId}/complete', 'GET /organizations/{organizationId}/inventory/{itemId}/photo'] as const
export const databaseApiScope = 'aws.cognito.signin.user.admin'
export interface ApiConfiguration { apiId: string; issuer: string; clientId: string }
export function apiConfiguration(env: Record<string, string | undefined> = process.env): ApiConfiguration {
  const environment = env.STUDIOSTACK_ENV
  const expectedApi = environment === 'dev' ? 'vugf6fpl4k' : environment === 'prod' ? 'ixzikwz8n5' : undefined
  if (!expectedApi || env.DATABASE_API_ID !== expectedApi) throw new Error('Database API environment mismatch')
  if (!/^us-east-2_[a-zA-Z0-9]+$/.test(env.COGNITO_USER_POOL_ID ?? '') || !/^[a-z0-9]{1,128}$/.test(env.COGNITO_APP_CLIENT_ID ?? '')) {
    throw new Error('Cognito user pool and app client must be explicitly configured')
  }
  return { apiId: expectedApi, issuer: `https://cognito-idp.us-east-2.amazonaws.com/${env.COGNITO_USER_POOL_ID}`, clientId: env.COGNITO_APP_CLIENT_ID! }
}
export function trustedIdentity(event: APIGatewayProxyEventV2WithJWTAuthorizer, config: ApiConfiguration, now: number): Identity {
  const claims = event.requestContext?.authorizer?.jwt?.claims
  if (event.version !== '2.0' || event.requestContext?.apiId !== config.apiId || !claims || claims.iss !== config.issuer || claims.client_id !== config.clientId ||
      claims.token_use !== 'access' || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 256 ||
      !Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now / 1000 ||
      typeof claims.scope !== 'string' || !claims.scope.split(' ').includes(databaseApiScope)) {
    throw new ApiError(401, 'A valid access token is required')
  }
  // Standard Cognito access tokens normally do not include email; keep it null.
  const email = claims.email_verified === 'true' && typeof claims.email === 'string' && claims.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ? claims.email : null
  return { issuer: config.issuer, subject: claims.sub, email }
}
function json(event: APIGatewayProxyEventV2WithJWTAuthorizer): unknown {
  if (typeof event.body !== 'string' || event.body.length > 90_000) throw new ApiError(400, 'A JSON body up to 64 KiB is required')
  const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (Buffer.byteLength(body) > 65_536) throw new ApiError(400, 'Request body is too large')
  try { return JSON.parse(body) } catch { throw new ApiError(400, 'Invalid JSON') }
}
function request(event: APIGatewayProxyEventV2WithJWTAuthorizer): ApiRequest {
  if (![...databaseApiRoutes, ...privatePhotoRoutes, ...productionRoutes, ...accountRoutes, ...equipmentRoutes, ...reportRoutes, ...alertRoutes].some(route => route === event.routeKey) || event.requestContext.http.method !== event.routeKey.split(' ')[0]) throw new ApiError(404, 'Route not found')
  if(alertRoutes.includes(event.routeKey))return alertRequest(event,()=>json(event))
  if(reportRoutes.includes(event.routeKey))return reportRequest(event,()=>json(event))
  if(equipmentRoutes.includes(event.routeKey))return equipmentRequest(event,()=>json(event))
  if (accountRoutes.includes(event.routeKey)) return accountRequest(event, () => json(event))
  if (productionRoutes.includes(event.routeKey)) return productionRequest(event, () => json(event))
  const params = event.queryStringParameters ?? {}
  if (event.routeKey === 'POST /photos/uploads') {
    object(params, [])
    const input = createPhotoUpload(json(event))
    return { operation: 'photoUpload', organizationId: input.organizationId, input }
  }
  if (event.routeKey === 'GET /me') {
    object(params, [])
    return { operation: 'me' }
  }
  if (event.routeKey === 'POST /me') {
    object(params, [])
    const body = object(json(event), ['displayName'])
    return { operation: 'register', displayName: body.displayName === undefined ? null : text(body.displayName, 120) }
  }
  if (event.routeKey === 'GET /organizations') return { operation: 'organizations', page: pagination(params) }
  const organizationId = uuid(event.pathParameters?.organizationId)
  if (event.routeKey === 'GET /organizations/{organizationId}/members') return { operation: 'members', organizationId, page: pagination(params) }
  if (event.routeKey === 'GET /organizations/{organizationId}/groups') return { operation: 'groups', organizationId, page: pagination(params) }
  if (event.routeKey === 'GET /organizations/{organizationId}/inventory') return { operation: 'inventory', organizationId, page: pagination(params) }
  if (event.routeKey === 'GET /organizations/{organizationId}/reservations') return { operation: 'reservations', organizationId, page: pagination(params) }
  object(params, [])
  switch (event.routeKey) {
    case 'POST /organizations/{organizationId}/groups': return { operation: 'createGroup', organizationId, name: text(object(json(event), ['name']).name, 120) }
    case 'POST /organizations/{organizationId}/inventory': return { operation: 'createEquipment', organizationId, input: createEquipment(json(event)) }
    case 'PATCH /organizations/{organizationId}/inventory/{itemId}': return { operation: 'updateEquipment', organizationId, itemId: uuid(event.pathParameters?.itemId), input: updateEquipment(json(event)) }
    case 'POST /organizations/{organizationId}/reservations': return { operation: 'createReservation', organizationId, input: createReservation(json(event)) }
    case 'GET /organizations/{organizationId}/reservations/{reservationId}': return { operation: 'reservation', organizationId, reservationId: uuid(event.pathParameters?.reservationId) }
    case 'POST /organizations/{organizationId}/reservations/{reservationId}/cancel':
      object(json(event), [])
      return { operation: 'cancelReservation', organizationId, reservationId: uuid(event.pathParameters?.reservationId) }
    case 'POST /organizations/{organizationId}/photos/{photoId}/complete':
      object(json(event), [])
      return { operation: 'completePhoto', organizationId, photoId: uuid(event.pathParameters?.photoId) }
    case 'GET /organizations/{organizationId}/inventory/{itemId}/photo': return { operation: 'downloadPhoto', organizationId, itemId: uuid(event.pathParameters?.itemId) }
    default: throw new ApiError(404, 'Route not found')
  }
}
export function createDatabaseApiHandler(repository: Pick<ReturnType<typeof createApiRepository>, 'execute'>, config: ApiConfiguration, now = Date.now) {
  return async (event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyStructuredResultV2> => {
    const respond = (statusCode: number, value: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, body: JSON.stringify(value) })
    try {
      const identity = trustedIdentity(event, config, now())
      const parsed = request(event)
      const value = await repository.execute(identity, parsed)
      if(parsed.operation==='reports'&&parsed.method!=='GET'||parsed.operation==='equipment'&&parsed.method!=='GET'||parsed.operation==='updateEquipment'||parsed.operation==='alerts'&&parsed.resource==='list')console.log(JSON.stringify({type:'app-alert-queued'}))
      if(parsed.operation==='accounts'&&parsed.resource==='invitations'&&parsed.method==='POST'&&(!parsed.invitationId||parsed.action==='retry'))console.log(JSON.stringify({type:'account-invitation-queued'}))
      if (parsed.operation === 'production' && (
        (parsed.resource === 'actions' && ['approve','request_changes','deny','withdraw','schedule'].includes(String((parsed.body as {action?:string})?.action))) ||
        (parsed.resource === 'deliveries' && parsed.method === 'POST' && parsed.deliveryId)
      )) {
        // Emitted only after the transaction commits. CloudWatch delivers this
        // small wake-up signal to the outside-VPC sender; no customer data logged.
        console.log(JSON.stringify({type:'production-decision-queued'}))
      }
      return respond(200, value)
    } catch (error) {
      if (error instanceof ApiError) return respond(error.status, { error: error.message })
      // Never return raw SQL, credentials, AWS details, or customer data in errors.
      return respond(503, { error: 'Database API temporarily unavailable' })
    }
  }
}
