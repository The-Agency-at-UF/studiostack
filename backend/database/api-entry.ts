import {feedbackRequest,feedbackTask} from '../email/feedback'
import {alertOutboxRequest,alertOutboxTask} from '../alerts/outbox'
import { outboxTask, parseOutboxRequest } from '../production/outbox'
import {directoryRequest,directoryTask} from '../accounts/directory'
import {invitationQueueRequest,invitationQueueTask} from '../accounts/queue'
import { createBriefStorage } from '../production/storage'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { createDatabase, type DatabaseClient } from './client'
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

/** IAM-only maintenance tasks, invoked with a `task` name and never through API Gateway. */
const tasks = new Map<string, (client: DatabaseClient, input: unknown) => Promise<unknown>>([
  ['email-feedback', (client, input) => feedbackTask(client, feedbackRequest(input))],
  ['app-alert-outbox', (client, input) => alertOutboxTask(client, alertOutboxRequest(input))],
  ['account-invitation-queue', (client, input) => invitationQueueTask(client, invitationQueueRequest(input))],
  ['account-directory', (client, input) => directoryTask(client, directoryRequest(input, process.env.COGNITO_USER_POOL_ID ?? ''))],
  ['production-outbox', (client, input) => outboxTask(client, parseOutboxRequest(input))],
])

/** Reuses the private database Lambda with environment-scoped service permissions. */
export async function handler(event: APIGatewayProxyEventV2WithJWTAuthorizer | Record<string, never> = {}) {
  try {
    const { database, apiHandler, databaseHandler } = getRuntime()
    const task = 'task' in event && !('requestContext' in event) && !('version' in event) ? tasks.get(String(event.task)) : undefined
    if (task) {
      const input: Record<string, unknown> = { ...event }; delete input.task
      return database.withClient(client => task(client, input))
    }
    // Preserve the existing IAM-only empty-payload connection diagnostic. Public
    // API Gateway calls always contain requestContext/version, regardless of body.
    if (Object.keys(event).length === 0) return databaseHandler()
    return apiHandler(event as APIGatewayProxyEventV2WithJWTAuthorizer)
  } catch {
    return { statusCode: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Database API temporarily unavailable' }) }
  }
}
