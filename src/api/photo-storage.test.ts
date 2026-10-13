// @vitest-environment node
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { sanitizePhoto, photoStorageConfig } from '../../backend/database/photo-storage'

describe('private photo byte validation', () => {
  const make = () => sharp({ create: { width: 80, height: 60, channels: 3, background: '#ff4466' } })
  it.each(['jpeg', 'webp'] as const)('re-encodes %s into stripped display JPEG', async type => {
    const original = await make()[type]().withMetadata().toBuffer()
    const result = await sanitizePhoto(original, `image/${type}`)
    expect(result).toMatchObject({ width: 80, height: 60 })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    const metadata = await sharp(result.bytes).metadata()
    expect(metadata.format).toBe('jpeg')
    expect(metadata.exif).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
  })
  it('rejects a spoofed type and malformed bytes', async () => {
    await expect(sanitizePhoto(await make().png().toBuffer(), 'image/jpeg')).rejects.toMatchObject({ status: 400 })
    await expect(sanitizePhoto(Buffer.from('<svg></svg>'), 'image/jpeg')).rejects.toMatchObject({ status: 400 })
  })
  it('rejects oversized dimensions and empty uploads', async () => {
    const oversized = await sharp({ create: { width: 2561, height: 1, channels: 3, background: '#000' } }).jpeg().toBuffer()
    await expect(sanitizePhoto(oversized, 'image/jpeg')).rejects.toMatchObject({ status: 400 })
    await expect(sanitizePhoto(new Uint8Array(), 'image/webp')).rejects.toMatchObject({ status: 400 })
  })
  it('rejects cross-environment bucket configuration', () => {
    expect(() => photoStorageConfig({ STUDIOSTACK_ENV: 'dev', AWS_REGION: 'us-east-2', S3_PHOTOS_BUCKET: 'studio-stack-photos-prod' })).toThrow()
  })
})
