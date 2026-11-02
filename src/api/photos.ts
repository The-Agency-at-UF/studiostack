import { MAX_UPLOAD_BYTES, preparePhoto } from './preparePhoto'

export interface PhotoUpload { key: string }

/** Requires a real identity-provider access token; the local demo session is not authentication. */
export async function uploadPhoto(file: File, accessToken: string): Promise<PhotoUpload> {
  if (!process.env.NEXT_PUBLIC_PHOTO_UPLOAD_API_URL) throw new Error('Photo API is not configured')
  if (!accessToken) throw new Error('Sign in before uploading a photo')
  return uploadPreparedPhoto(await preparePhoto(file), accessToken)
}

/** Upload a photo already converted by preparePhoto, without decoding it again. */
export async function uploadPreparedPhoto(file: File, accessToken: string): Promise<PhotoUpload> {
  const endpoint = process.env.NEXT_PUBLIC_PHOTO_UPLOAD_API_URL
  if (!endpoint) throw new Error('Photo API is not configured')
  if (!accessToken) throw new Error('Sign in before uploading a photo')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Upload a processed JPEG, PNG, or WebP under 10 MiB')
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  })
  if (!response.ok) throw new Error('Could not authorize the photo upload')
  const { url, fields, key } = await response.json() as {
    url: string; fields: Record<string, string>; key: string
  }
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  form.append('file', file)
  const upload = await fetch(url, { method: 'POST', body: form })
  if (!upload.ok) throw new Error('Photo upload failed')
  return { key }
}
