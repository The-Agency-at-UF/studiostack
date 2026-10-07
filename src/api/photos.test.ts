import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadPhoto } from './photos'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('browser photo uploads', () => {
  it('fails before any request when the API is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', '')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(uploadPhoto(new File(['photo'], 'photo.png'), 'test-token')).rejects.toThrow('not configured')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('requires an access token', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', 'https://api.example.test/photos/uploads')
    await expect(uploadPhoto(new File(['photo'], 'photo.png'), '')).rejects.toThrow('Sign in')
  })
  it('requests authorization before uploading a multipart form to S3', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', 'https://api.example.test/photos/uploads')
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://bucket.example.test', fields: { key: 'photos/id.png' }, key: 'photos/id.png' }) })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetch)
    const file = new File(['photo'], 'photo.png', { type: 'image/png' })
    expect(await uploadPhoto(file, 'test-token')).toEqual({ key: 'photos/id.png' })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(fetch.mock.calls[1][1].body.get('key')).toBe('photos/id.png')
    expect(fetch.mock.calls[1][1].body.get('file')).toBeInstanceOf(File)
  })
})
