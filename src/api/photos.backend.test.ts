// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { createUploadHandler, MAX_PHOTO_BYTES, parseUploadRequest, photoConfig, signPhotoUpload } from '../../backend/photos'

function event(body = '{"contentType":"image/jpeg","size":100}', sub: string | undefined = 'user-1') {
  return {
    body,
    requestContext: { http: { method: 'POST' }, authorizer: { jwt: { claims: { sub } } } },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer
}

describe('photo upload authorization', () => {
  it('accepts supported photos', () => {
    expect(parseUploadRequest({ contentType: 'image/png', size: MAX_PHOTO_BYTES })).not.toBeNull()
  })
  it.each([
    { contentType: 'image/svg+xml', size: 10 },
    { contentType: 'toString', size: 10 },
    { contentType: 'image/png', size: 0 },
    { contentType: 'image/png', size: MAX_PHOTO_BYTES + 1 },
    { contentType: 'image/png', size: 1.2 },
    { contentType: 'image/png', size: '100' },
    null,
  ])('rejects invalid input %j', value => {
    expect(parseUploadRequest(value)).toBeNull()
  })
  it('requires verified identity before calling AWS', async () => {
    const signer = vi.fn()
    const request = event()
    request.requestContext.authorizer = { jwt: { claims: {}, scopes: [] } }
    expect((await createUploadHandler(signer)(request)).statusCode).toBe(401)
    expect(signer).not.toHaveBeenCalled()
  })
  it('rejects malformed JSON', async () => {
    expect((await createUploadHandler(vi.fn())(event('no'))).statusCode).toBe(400)
  })
  it('uses the verified subject, not a client-supplied identity', async () => {
    const signer = vi.fn().mockResolvedValue({ url: 'https://example.com', fields: {}, key: 'photos/user-1/id.jpg' })
    const result = await createUploadHandler(signer)(event('{"contentType":"image/jpeg","size":100,"userId":"other"}'))
    expect(result.statusCode).toBe(200)
    expect(signer).toHaveBeenCalledWith('user-1', { contentType: 'image/jpeg', size: 100 })
  })
  it('rejects oversized files before signing', async () => {
    const signer = vi.fn()
    const result = await createUploadHandler(signer)(event(JSON.stringify({ contentType: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })))
    expect(result.statusCode).toBe(400)
    expect(signer).not.toHaveBeenCalled()
  })
  it('does not expose internal AWS errors', async () => {
    const signer = vi.fn().mockRejectedValue(new Error('private credential details'))
    const result = await createUploadHandler(signer)(event())
    expect(result.statusCode).toBe(503)
    expect(result.body).not.toContain('private credential')
  })
  it('requires explicit backend configuration', () => {
    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('S3_PHOTOS_BUCKET', '')
    try { expect(photoConfig).toThrow('required') } finally { vi.unstubAllEnvs() }
  })
  it('signs a bounded, unique upload policy without making an AWS network request', async () => {
    vi.stubEnv('AWS_REGION', 'us-east-2')
    vi.stubEnv('S3_PHOTOS_BUCKET', 'studio-stack-photos-dev')
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'TEST-ONLY-NOT-A-REAL-KEY')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'TEST-ONLY-NOT-A-REAL-SECRET')
    vi.stubEnv('AWS_SESSION_TOKEN', '')
    try {
      const first = await signPhotoUpload('user/one', { contentType: 'image/png', size: 123 })
      const second = await signPhotoUpload('user/one', { contentType: 'image/png', size: 123 })
      expect(first.key).toMatch(/^photos\/user%2Fone\/[\w-]+\.png$/)
      expect(second.key).not.toBe(first.key)
      expect(first.url).toContain('studio-stack-photos-dev.s3.us-east-2.amazonaws.com')
      const policy = JSON.parse(Buffer.from(first.fields.Policy, 'base64').toString('utf8'))
      expect(policy.conditions).toContainEqual(['content-length-range', 123, 123])
      expect(policy.conditions).toContainEqual(['eq', '$Content-Type', 'image/png'])
      expect(first.fields.key).toBe(first.key)
    } finally { vi.unstubAllEnvs() }
  })
})
