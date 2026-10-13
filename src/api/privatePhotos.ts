import type { createDatabaseApiClient } from './database'
import { preparePhoto } from './preparePhoto'

/** New organization-scoped flow, separate from the legacy upload contract.
 * Requires an actual Cognito token provider configured on the database client.
 */
export async function uploadOrganizationPhoto(file: File, organizationId: string, api: ReturnType<typeof createDatabaseApiClient>, requestId = crypto.randomUUID()) {
  const processed = await preparePhoto(file)
  const authorization = await api.createPhotoUpload({ organizationId, contentType: 'image/jpeg', size: processed.size, requestId })
  const endpoint = new URL(authorization.url)
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'studio-stack-photos-dev.s3.us-east-2.amazonaws.com' && endpoint.hostname !== 'studio-stack-photos-prod.s3.us-east-2.amazonaws.com' || endpoint.username || endpoint.password || endpoint.search) throw new Error('Unexpected private upload destination')
  const form = new FormData()
  for (const [key, value] of Object.entries(authorization.fields)) form.append(key, value)
  form.append('file', processed)
  const response = await fetch(endpoint, { method: 'POST', body: form, credentials: 'omit', redirect: 'error' })
  if (!response.ok) throw new Error('Photo upload failed; start a new attempt')
  return api.completePhoto(organizationId, authorization.photoId)
}
