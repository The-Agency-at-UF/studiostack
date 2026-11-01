// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { photoConfig } from '../../backend/photos'

describe('photo bucket configuration', () => {
  it('requires explicit backend configuration', () => {
    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('S3_PHOTOS_BUCKET', '')
    try { expect(photoConfig).toThrow('required') } finally { vi.unstubAllEnvs() }
  })
  it('returns the configured region and bucket', () => {
    vi.stubEnv('AWS_REGION', 'us-east-2')
    vi.stubEnv('S3_PHOTOS_BUCKET', 'studio-stack-photos-dev')
    try { expect(photoConfig()).toEqual({ region: 'us-east-2', bucket: 'studio-stack-photos-dev' }) } finally { vi.unstubAllEnvs() }
  })
})
