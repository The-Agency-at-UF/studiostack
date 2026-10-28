import { S3Client, HeadObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ApiError } from '../database/api-validation'
export interface StoredAttachment { key: string; size: number; contentType: string }
export interface BriefStorage {
  signUpload(input: StoredAttachment): Promise<{ url: string; fields: Record<string, string> }>
  verify(input: StoredAttachment): Promise<void>
  signDownload(key: string, name: string): Promise<{ url: string; expiresIn: number }>
}
export function createBriefStorage(): BriefStorage {
  const environment = process.env.STUDIOSTACK_ENV, bucket = process.env.S3_PHOTOS_BUCKET
  if (!['dev', 'prod'].includes(environment ?? '') || bucket !== `studio-stack-photos-${environment}`) throw new Error('Brief storage environment mismatch')
  const s3 = new S3Client({ region: 'us-east-2' })
  const staging = (key: string) => `staging/${key.split('/')[1]}/briefs/${key.split('/').slice(2).join('/')}`
  return {
    async signUpload(input) {
      const result = await createPresignedPost(s3, { Bucket: bucket, Key: staging(input.key), Expires: 300,
        Fields: { 'Content-Type': input.contentType, 'x-amz-server-side-encryption': 'AES256' }, Conditions: [['content-length-range', input.size, input.size], ['eq', '$Content-Type', input.contentType], ['eq', '$x-amz-server-side-encryption', 'AES256']] })
      return { url: result.url, fields: result.fields }
    },
    async verify(input) {
      const key = staging(input.key)
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      if (head.ContentLength !== input.size || head.ContentType !== input.contentType || !head.ETag) throw new ApiError(400, 'Uploaded attachment size or type does not match')
      const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: 'bytes=0-31', IfMatch: head.ETag }))
      const bytes = Buffer.from(await response.Body!.transformToByteArray())
      const valid = input.contentType === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : input.contentType === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : input.contentType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
      if (!valid) throw new ApiError(400, 'File contents do not match the selected format')
      // Copy a pinned, verified version to a key that no browser can upload to.
      await s3.send(new CopyObjectCommand({ Bucket: bucket, Key: input.key, CopySource: `${bucket}/${key}`, CopySourceIfMatch: head.ETag, MetadataDirective: 'REPLACE', ContentType: input.contentType, ContentDisposition: 'attachment', ServerSideEncryption: 'AES256' }))
    },
    async signDownload(key, name) { return { url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}` }), { expiresIn: 60 }), expiresIn: 60 } },
  }
}
