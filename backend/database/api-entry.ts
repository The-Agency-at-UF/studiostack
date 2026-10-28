import { outboxTask, parseOutboxRequest } from '../production/outbox'
import { createBriefStorage } from '../production/storage'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { createDatabase } from './client'
import { databaseConfig } from './config'
import { createDatabaseHandler } from './handler'
import { apiConfiguration, createDatabaseApiHandler } from './api'
import { createApiRepository } from './api-repository'
import { createPhotoStorage } from './photo-storage'

/** Reuses the private database Lambda with environment-scoped service permissions. */
export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer | Record<string, never> = {}) {
  try {
    const config = databaseConfig()
    const database = createDatabase(config)
    if ('task' in event && event.task === 'production-outbox' && !('requestContext' in event) && !('version' in event)) {
      const request = { ...event }; delete request.task
      return database.withClient(client => outboxTask(client, parseOutboxRequest(request)))
    }
    // Preserve the existing IAM-only empty-payload connection diagnostic. Public
    // API Gateway calls always contain requestContext/version, regardless of body.
    if (Object.keys(event).length === 0) return createDatabaseHandler(database, config)()
    return createDatabaseApiHandler(createApiRepository(database, Date.now, createPhotoStorage(), createBriefStorage()), apiConfiguration())(event as APIGatewayProxyEventV2WithJWTAuthorizer)
  } catch {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Database API temporarily unavailable' }) }
  }
}
