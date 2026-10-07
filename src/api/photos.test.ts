import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadPhoto } from './photos'
import { preparePhoto } from './preparePhoto'

vi.mock('./preparePhoto', () => ({ preparePhoto: vi.fn() }))

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

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
    const prepared = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' })
    vi.mocked(preparePhoto).mockResolvedValueOnce(prepared)
    expect(await uploadPhoto(file, 'test-token')).toEqual({ key: 'photos/id.png' })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ contentType: 'image/jpeg', size: prepared.size })
    expect(fetch.mock.calls[1][1].body.get('key')).toBe('photos/id.png')
    expect(fetch.mock.calls[1][1].body.get('file')).toEqual(prepared)
  })
  it('does not request authorization or upload when processing fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', 'https://api.example.test/photos/uploads')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.mocked(preparePhoto).mockRejectedValueOnce(new Error('Photo too large'))
    await expect(uploadPhoto(new File(['photo'], 'photo.heic'), 'token')).rejects.toThrow('too large')
    expect(fetch).not.toHaveBeenCalled()
  })
})
