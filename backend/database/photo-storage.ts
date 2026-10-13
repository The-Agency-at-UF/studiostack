import { createHash } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { ApiError } from './api-validation'

export interface PendingPhoto { id: string; organizationId: string; stagingKey: string; contentType: 'image/jpeg' | 'image/webp'; inputSize: number }
export interface StoredPhoto { key: string; width: number; height: number; size: number; sha256: string }
export interface PhotoStorage {
  signUpload(photo: PendingPhoto): Promise<{ url: string; fields: Record<string, string> }>
  finalize(photo: PendingPhoto): Promise<StoredPhoto>
  signDownload(key: string): Promise<{ url: string; expiresIn: number }>
}
export function photoStorageConfig(env: Record<string, string | undefined> = process.env) {
  if (!['dev', 'prod'].includes(env.STUDIOSTACK_ENV ?? '') || env.AWS_REGION !== 'us-east-2' || env.S3_PHOTOS_BUCKET !== `studio-stack-photos-${env.STUDIOSTACK_ENV}`) throw new Error('Photo bucket must match the database environment')
  return { region: 'us-east-2', bucket: env.S3_PHOTOS_BUCKET }
}
const maxBytes = 10 * 1024 * 1024
export async function sanitizePhoto(bytes: Uint8Array, contentType: PendingPhoto['contentType']): Promise<Omit<StoredPhoto, 'key'> & { bytes: Buffer }> {
  if (!bytes.length || bytes.length > maxBytes) throw new ApiError(400, 'Photo size is invalid')
  const signature = contentType === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  if (!signature) throw new ApiError(400, 'Photo bytes do not match the authorized image type')
  try {
    const image = sharp(Buffer.from(bytes), { limitInputPixels: 2560 * 2560, failOn: 'warning', sequentialRead: true })
    const metadata = await image.metadata()
    const expected = contentType === 'image/jpeg' ? 'jpeg' : 'webp'
    if (metadata.format !== expected || !metadata.width || !metadata.height || metadata.width > 2560 || metadata.height > 2560 || (metadata.pages ?? 1) !== 1) throw new Error('Invalid decoded image')
    // Re-encode instead of trusting extension/MIME or retaining EXIF/location.
    const output = await image.rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true })
    if (output.data.length > maxBytes) throw new Error('Processed image too large')
    return { bytes: output.data, width: output.info.width, height: output.info.height, size: output.data.length, sha256: createHash('sha256').update(output.data).digest('hex') }
  } catch { throw new ApiError(400, 'Use a valid, non-animated processed JPEG or WebP no larger than 2560px') }
}
export function createPhotoStorage(config = photoStorageConfig()): PhotoStorage {
  const service = new S3Client({ region: config.region, maxAttempts: 1 })
  return {
    async signUpload(photo) {
      return createPresignedPost(service, {
        Bucket: config.bucket, Key: photo.stagingKey, Expires: 300,
        Fields: { 'Content-Type': photo.contentType },
        Conditions: [['eq', '$Content-Type', photo.contentType], ['content-length-range', photo.inputSize, photo.inputSize]],
      })
    },
    async finalize(photo) {
      let input: Uint8Array
      try {
        const source = await service.send(new GetObjectCommand({ Bucket: config.bucket, Key: photo.stagingKey }), { abortSignal: AbortSignal.timeout(12_000) })
        if (source.ContentLength !== photo.inputSize || !source.Body) { source.Body?.transformToWebStream().cancel().catch(() => undefined); throw new ApiError(400, 'Uploaded size does not match authorization') }
        input = await source.Body.transformToByteArray()
      } catch (error) {
        if (error instanceof ApiError) throw error
        // Without bucket-list access S3 deliberately reports missing objects as
        // AccessDenied. Do not grant ListBucket just to distinguish existence.
        if (['NoSuchKey', 'AccessDenied'].includes((error as { name?: string })?.name ?? '')) throw new ApiError(409, 'The staged photo is not available; upload it before completing')
        throw error
      }
      if (input.length !== photo.inputSize) throw new ApiError(400, 'Uploaded size does not match authorization')
      const sanitized = await sanitizePhoto(input, photo.contentType)
      const key = `photos/${photo.organizationId}/${photo.id}.jpg`
      await service.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: sanitized.bytes, ContentType: 'image/jpeg', CacheControl: 'private, no-store', ServerSideEncryption: 'AES256' }), { abortSignal: AbortSignal.timeout(8_000) })
      return { key, width: sanitized.width, height: sanitized.height, size: sanitized.size, sha256: sanitized.sha256 }
    },
    async signDownload(key) {
      if (!/^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(key)) throw new Error('Unexpected private photo key')
      return { expiresIn: 60, url: await getSignedUrl(service, new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseContentType: 'image/jpeg', ResponseContentDisposition: 'inline', ResponseCacheControl: 'private, no-store' }), { expiresIn: 60 }) }
    },
  }
}
