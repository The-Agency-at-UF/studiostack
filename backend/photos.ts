import { randomUUID } from 'node:crypto'
import { S3Client } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export interface UploadRequest { contentType: string; size: number }
export interface UploadForm { url: string; fields: Record<string, string>; key: string }

export function photoConfig() {
  const region = process.env.AWS_REGION
  const bucket = process.env.S3_PHOTOS_BUCKET
  if (!region || !bucket) throw new Error('AWS_REGION and S3_PHOTOS_BUCKET are required')
  return { region, bucket }
}

export function parseUploadRequest(value: unknown): UploadRequest | null {
  if (!value || typeof value !== 'object') return null
  const { contentType, size } = value as Record<string, unknown>
  if (typeof contentType !== 'string' || !Object.hasOwn(extensions, contentType)) return null
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 || size > MAX_PHOTO_BYTES) return null
  return { contentType, size }
}

export async function signPhotoUpload(userId: string, request: UploadRequest): Promise<UploadForm> {
  const { region, bucket } = photoConfig()
  const key = `photos/${encodeURIComponent(userId)}/${randomUUID()}.${extensions[request.contentType]}`
  const result = await createPresignedPost(new S3Client({ region }), {
    Bucket: bucket,
    Key: key,
    Expires: 300,
    Fields: { 'Content-Type': request.contentType },
    Conditions: [
      ['eq', '$Content-Type', request.contentType],
      ['content-length-range', request.size, request.size],
    ],
  })
  return { ...result, key }
}

// Deploy ONLY behind an API Gateway JWT authorizer. Never trust the UI's local session.
export function createUploadHandler(signer = signPhotoUpload) {
  return async (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
    const respond = (statusCode: number, body: object) => ({
      statusCode,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify(body),
    })
    if (event.requestContext.http.method !== 'POST') return respond(405, { error: 'POST required' })
    const userId = event.requestContext.authorizer?.jwt?.claims?.sub
    if (typeof userId !== 'string' || !userId || userId.length > 256) {
      return respond(401, { error: 'Authentication required' })
    }
    let request: UploadRequest | null
    try {
      const body = event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? ''
      request = parseUploadRequest(JSON.parse(body))
    } catch {
      return respond(400, { error: 'Invalid JSON' })
    }
    if (!request) return respond(400, { error: 'Use a processed JPEG or WebP, between 1 byte and 10 MiB' })
    try {
      return respond(200, await signer(userId, request))
    } catch {
      // Do not expose AWS credentials, signing forms, or internal errors to callers/logs.
      return respond(503, { error: 'Photo uploads are temporarily unavailable' })
    }
  }
}

export const handler = createUploadHandler()
