import { afterEach, describe, expect, it, vi } from 'vitest'
import { uploadPhoto, uploadPreparedPhoto } from './photos'
import { preparePhoto } from './preparePhoto'

vi.mock('./preparePhoto', () => ({ MAX_UPLOAD_BYTES: 10 * 1024 * 1024, preparePhoto: vi.fn() }))

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
    expect(await uploadPreparedPhoto(file, 'test-token')).toEqual({ key: 'photos/id.png' })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
    expect(fetch.mock.calls[1][1].body.get('key')).toBe('photos/id.png')
    expect(fetch.mock.calls[1][1].body.get('file')).toBeInstanceOf(File)
  })
  it('processes the original photo before signing its converted size and type', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', 'https://api.example.test/photos/uploads')
    const original = new File(['heic'], 'camera.heic', { type: 'image/heic' })
    const prepared = new File(['converted'], 'camera.jpg', { type: 'image/jpeg' })
    vi.mocked(preparePhoto).mockResolvedValueOnce(prepared)
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://bucket.example.test', fields: { key: 'photos/id.jpg' }, key: 'photos/id.jpg' }) }).mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetch)
    await uploadPhoto(original, 'real-token')
    expect(preparePhoto).toHaveBeenCalledWith(original)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ contentType: 'image/jpeg', size: prepared.size })
  })
  it('does not upload to S3 when authorization is rejected', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', 'https://api.example.test/photos/uploads')
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false })
    vi.stubGlobal('fetch', fetch)
    await expect(uploadPreparedPhoto(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }), 'token')).rejects.toThrow('authorize')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('rejects originals and oversized processed files before contacting the API', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHOTO_UPLOAD_API_URL', 'https://api.example.test/photos/uploads')
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(uploadPreparedPhoto(new File(['photo'], 'phone.heic', { type: 'image/heic' }), 'token')).rejects.toThrow('processed')
    await expect(uploadPreparedPhoto(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }), 'token')).rejects.toThrow('10 MiB')
    expect(fetch).not.toHaveBeenCalled()
  })
})
