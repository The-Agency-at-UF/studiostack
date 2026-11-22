import { createHash } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import { ApiError } from './api-validation'
import {objectAlreadyWritten,objectUnavailable} from './private-object'

export interface PendingPhoto { id: string; organizationId: string; stagingKey: string; contentType: 'image/jpeg' | 'image/webp'; inputSize: number }
interface StoredPhoto { key: string; width: number; height: number; size: number; sha256: string }
export interface PhotoStorage {
  signUpload(photo: PendingPhoto): Promise<{ url: string; fields: Record<string, string> }>
  finalize(photo: PendingPhoto, options?: {recoverOnly?:boolean}): Promise<StoredPhoto>
  /** Defaults to a 60-second, uncached link; logos ask for a longer, browser-cacheable one. */
  signDownload(key: string, options?: { expiresIn?: number; cacheable?: boolean }): Promise<{ url: string; expiresIn: number }>
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
  async function finalized(key:string):Promise<StoredPhoto|null> {
    const head=await service.send(new HeadObjectCommand({Bucket:config.bucket,Key:key}),{abortSignal:AbortSignal.timeout(8_000)}).catch(error=>{
      if(objectUnavailable(error))return null
      throw error
    })
    if(!head)return null
    const size=head.ContentLength??0
    if(head.ContentType!=='image/jpeg'||size<1||size>maxBytes||!head.ETag)throw new ApiError(409,'Saved private photo metadata is invalid')
    const metadata=head.Metadata
    if(metadata?.sha256){
      const width=Number(metadata.width),height=Number(metadata.height)
      if(![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=2560)||!/^[a-f0-9]{64}$/.test(metadata.sha256))throw new ApiError(409,'Saved private photo metadata is invalid')
      return {key,size,width,height,sha256:metadata.sha256}
    }
    // Previously finalized photos have no persisted dimensions or digest on S3.
    const existing=await service.send(new GetObjectCommand({Bucket:config.bucket,Key:key,IfMatch:head.ETag}),{abortSignal:AbortSignal.timeout(12_000)})
    const bytes=Buffer.from(await existing.Body!.transformToByteArray())
    const {format,width,height}=await sharp(bytes,{limitInputPixels:2560*2560,failOn:'warning'}).metadata()
    if(format!=='jpeg'||!width||!height||width>2560||height>2560||bytes.length!==size)throw new ApiError(409,'Saved private photo contents are invalid')
    return {key,size,width,height,sha256:createHash('sha256').update(bytes).digest('hex')}
  }
  return {
    async signUpload(photo) {
      return createPresignedPost(service, {
        Bucket: config.bucket, Key: photo.stagingKey, Expires: 300,
        Fields: { 'Content-Type': photo.contentType },
        Conditions: [['eq', '$Content-Type', photo.contentType], ['content-length-range', photo.inputSize, photo.inputSize]],
      })
    },
    async finalize(photo,{recoverOnly=false}={}) {
      const key = `photos/${photo.organizationId}/${photo.id}.jpg`
      const existing=await finalized(key)
      if(existing)return existing
      if(recoverOnly)throw new ApiError(409,'Photo upload expired; start a new upload')
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
      try {
        await service.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, IfNoneMatch:'*', Body: sanitized.bytes, ContentType: 'image/jpeg', CacheControl: 'private, no-store', ServerSideEncryption: 'AES256',
          Metadata:{width:String(sanitized.width),height:String(sanitized.height),sha256:sanitized.sha256} }), { abortSignal: AbortSignal.timeout(8_000) })
      } catch(error) {
        if(!objectAlreadyWritten(error))throw error
        const recovered=await finalized(key)
        if(!recovered)throw error
        return recovered
      }
      return { key, width: sanitized.width, height: sanitized.height, size: sanitized.size, sha256: sanitized.sha256 }
    },
    async signDownload(key, { expiresIn = 60, cacheable = false } = {}) {
      if (!/^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(key)) throw new Error('Unexpected private photo key')
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) throw new Error('Unexpected photo link lifetime')
      return { expiresIn, url: await getSignedUrl(service, new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseContentType: 'image/jpeg', ResponseContentDisposition: 'inline', ResponseCacheControl: cacheable ? `private, max-age=${expiresIn}` : 'private, no-store' }), { expiresIn }) }
    },
  }
}
