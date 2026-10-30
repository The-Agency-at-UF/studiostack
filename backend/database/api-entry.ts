import {feedbackRequest,feedbackTask} from '../email/feedback'
import {alertOutboxRequest,alertOutboxTask} from '../alerts/outbox'
import { outboxTask, parseOutboxRequest } from '../production/outbox'
import {directoryRequest,directoryTask} from '../accounts/directory'
import {invitationQueueRequest,invitationQueueTask} from '../accounts/queue'
import { createBriefStorage } from '../production/storage'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { createDatabase } from './client'
import { databaseConfig } from './config'
import { createDatabaseHandler } from './handler'
import { apiConfiguration, createDatabaseApiHandler } from './api'
import { createApiRepository } from './api-repository'
import { createPhotoStorage } from './photo-storage'

let cachedRuntime: {
  config: ReturnType<typeof databaseConfig>
  database: ReturnType<typeof createDatabase>
  apiHandler: ReturnType<typeof createDatabaseApiHandler>
  databaseHandler: ReturnType<typeof createDatabaseHandler>
} | undefined

function getRuntime() {
  if (!cachedRuntime) {
    const config = databaseConfig()
    const database = createDatabase(config)
    const repository = createApiRepository(database, Date.now, createPhotoStorage(), createBriefStorage())
    const apiHandler = createDatabaseApiHandler(repository, apiConfiguration())
    const databaseHandler = createDatabaseHandler(database, config)
    cachedRuntime = { config, database, apiHandler, databaseHandler }
  }
  return cachedRuntime
}

/** Reuses the private database Lambda with environment-scoped service permissions. */
export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer | Record<string, never> = {}) {
  try {
    const { database, apiHandler, databaseHandler } = getRuntime()
    if ('task' in event && event.task==='email-feedback' && !('requestContext' in event) && !('version' in event)) {const input={...event};delete input.task;return database.withClient(client=>feedbackTask(client,feedbackRequest(input)))}
    if ('task' in event && event.task==='app-alert-outbox' && !('requestContext' in event) && !('version' in event)) {
      const input={...event};delete input.task
      return database.withClient(client=>alertOutboxTask(client,alertOutboxRequest(input)))
    }
    if ('task' in event && event.task==='account-invitation-queue' && !('requestContext' in event) && !('version' in event)) {
      const input={...event};delete input.task
      return database.withClient(client=>invitationQueueTask(client,invitationQueueRequest(input)))
    }
    if ('task' in event && event.task==='account-directory' && !('requestContext' in event) && !('version' in event)) {
      const input={...event};delete input.task
      return database.withClient(client=>directoryTask(client,directoryRequest(input,process.env.COGNITO_USER_POOL_ID??'')))
    }
    if ('task' in event && event.task === 'production-outbox' && !('requestContext' in event) && !('version' in event)) {
      const request = { ...event }; delete request.task
      return database.withClient(client => outboxTask(client, parseOutboxRequest(request)))
    }
    // Preserve the existing IAM-only empty-payload connection diagnostic. Public
    // API Gateway calls always contain requestContext/version, regardless of body.
    if (Object.keys(event).length === 0) return databaseHandler()
    return apiHandler(event as APIGatewayProxyEventV2WithJWTAuthorizer)
  } catch {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Database API temporarily unavailable' }) }
  }
}
