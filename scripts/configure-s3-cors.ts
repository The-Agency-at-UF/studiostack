import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client, type CORSRule } from '@aws-sdk/client-s3'
import { photoConfig } from '../backend/photos'

const { region, bucket } = photoConfig()
if (bucket !== 'studio-stack-photos-dev' || region !== 'us-east-2') {
  throw new Error('This script may change only the StudioStack dev bucket in us-east-2')
}
const s3 = new S3Client({ region })
let rules: CORSRule[] = []
try {
  rules = (await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))).CORSRules ?? []
} catch (error) {
  if (!(error instanceof Error) || error.name !== 'NoSuchCORSConfiguration') throw error
}
const localRule: CORSRule = {
  ID: 'studiostack-local-photo-upload',
  AllowedOrigins: ['http://localhost:5174'],
  AllowedMethods: ['POST', 'GET', 'HEAD'],
  AllowedHeaders: ['*'],
  MaxAgeSeconds: 300,
}
// Preserve other rules; update only the rule owned by this script.
const merged = [...rules.filter(rule => rule.ID !== localRule.ID), localRule]
await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: merged } }))
console.log(`Enabled localhost:5174 photo CORS on ${bucket}; preserved other rules. Bucket access remains unchanged.`)
