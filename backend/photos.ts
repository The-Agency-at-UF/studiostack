/** S3 photo bucket settings for the local check and dev CORS scripts. */
export function photoConfig() {
  const region = process.env.AWS_REGION
  const bucket = process.env.S3_PHOTOS_BUCKET
  if (!region || !bucket) throw new Error('AWS_REGION and S3_PHOTOS_BUCKET are required')
  return { region, bucket }
}
