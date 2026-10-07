import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { photoConfig } from '../backend/photos'

const { region, bucket } = photoConfig()
if (bucket !== 'studio-stack-photos-dev' || region !== 'us-east-2') {
  throw new Error('Local connection checks are restricted to the StudioStack dev bucket in us-east-2')
}
try {
  await new S3Client({ region }).send(new HeadBucketCommand({ Bucket: bucket }))
  console.log(`Connected to ${bucket} in ${region}. No objects uploaded or changed.`)
} catch (error) {
  const name = error instanceof Error ? error.name : 'UnknownError'
  console.error(`S3 check failed (${name}). Configure and sign in to the studiostack-dev SSO profile first.`)
  process.exitCode = 1
}
