import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { imageSize } from 'image-size'
import { decodeHeif } from './decodeHeif'
import { decodeAvif } from './decodeAvif'
import { checkPhotoDimensions, MAX_ORIGINAL_BYTES, MAX_UPLOAD_BYTES, preparePhoto } from './preparePhoto'

vi.mock('image-size', () => ({ imageSize: vi.fn() }))
vi.mock('./decodeHeif', () => ({ decodeHeif: vi.fn() }))
vi.mock('./decodeAvif', () => ({ decodeAvif: vi.fn() }))
const original = () => new File(['original'], 'phone.heic', { type: 'image/heic' })
const bitmap = { width: 8000, height: 6000, close: vi.fn() }
const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' }
const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: vi.fn() }

beforeEach(() => {
  vi.mocked(imageSize).mockReturnValue({ width: 8000, height: 6000, type: 'heic' })
  bitmap.width = 8000; bitmap.height = 6000
  canvas.getContext.mockReturnValue(context)
  canvas.toBlob.mockImplementation(callback => callback(new Blob(['jpeg'], { type: 'image/jpeg' })))
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('device-side photo preparation', () => {
  it('converts a 48 MP phone photo to JPEG with a 2560px long edge', async () => {
    const file = original()
    const result = await preparePhoto(file)
    expect(result.name).toBe('phone.jpg')
    expect(result.type).toBe('image/jpeg')
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' })
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2560, 1920)
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85)
    expect(bitmap.close).toHaveBeenCalled()
    expect(canvas.width).toBe(0)
  })
  it('does not upscale small photos and flattens transparency on white', async () => {
    bitmap.width = 600; bitmap.height = 400
    await preparePhoto(original())
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 600, 400)
    expect(context.fillStyle).toBe('#fff')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 600, 400)
  })
  it.each(['jpg', 'png', 'webp', 'heic', 'mif1', 'avif'])('accepts detected %s regardless of filename/MIME', async type => {
    vi.mocked(imageSize).mockReturnValue({ width: 10, height: 10, type })
    expect((await preparePhoto(new File(['bytes'], 'unknown', { type: '' }))).type).toBe('image/jpeg')
  })
  it.each([0, MAX_ORIGINAL_BYTES + 1])('rejects original size %i before reading or decoding', async size => {
    const file = original()
    Object.defineProperty(file, 'size', { value: size })
    const read = vi.spyOn(file, 'arrayBuffer')
    await expect(preparePhoto(file)).rejects.toThrow('50 MiB')
    expect(read).not.toHaveBeenCalled()
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
  it('accepts the exact 50 MiB original boundary', async () => {
    const file = original()
    Object.defineProperty(file, 'size', { value: MAX_ORIGINAL_BYTES })
    await expect(preparePhoto(file)).resolves.toBeInstanceOf(File)
  })
  it('rejects unsupported files and unreadable headers', async () => {
    vi.mocked(imageSize).mockReturnValueOnce({ width: 10, height: 10, type: 'gif' })
    await expect(preparePhoto(original())).rejects.toThrow('Choose JPEG')
    vi.mocked(imageSize).mockImplementationOnce(() => { throw new Error('bad header') })
    await expect(preparePhoto(original())).rejects.toThrow('Could not read')
  })
  it.each([[10000, 5001], [0, 10], [NaN, 10], [1.5, 10]])('rejects invalid/oversized dimensions %i × %i', (w, h) => {
    expect(() => checkPhotoDimensions(w, h)).toThrow('50 megapixels')
  })
  it('accepts the exact 50 MP decoded boundary', () => {
    expect(() => checkPhotoDimensions(10000, 5000)).not.toThrow()
  })
  it('guards oversized auxiliary images before native decode', async () => {
    vi.mocked(imageSize).mockReturnValue({ width: 10, height: 10, type: 'heic', images: [{ width: 10000, height: 6000 }] })
    await expect(preparePhoto(original())).rejects.toThrow('50 megapixels')
    expect(createImageBitmap).not.toHaveBeenCalled()
  })
  it('checks actual decoded dimensions and closes a rejected bitmap', async () => {
    bitmap.width = 10000; bitmap.height = 6000
    await expect(preparePhoto(original())).rejects.toThrow('50 megapixels')
    expect(bitmap.close).toHaveBeenCalled()
  })
  it.each(['heic', 'mif1', 'avif'])('uses conversion fallback when native %s decoding fails', async type => {
    vi.mocked(imageSize).mockReturnValue({ width: 10, height: 10, type })
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('unsupported'))
    const decoded = { width: 20, height: 10 } as HTMLCanvasElement
    const fallback = type === 'avif' ? decodeAvif : decodeHeif
    vi.mocked(fallback).mockResolvedValueOnce(decoded)
    expect((await preparePhoto(original())).type).toBe('image/jpeg')
    expect(fallback).toHaveBeenCalled()
    expect(decoded.width).toBe(0)
  })
  it('fails clearly for native decoding failures without a compatible fallback', async () => {
    vi.mocked(imageSize).mockReturnValue({ width: 10, height: 10, type: 'jpg' })
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('corrupt'))
    await expect(preparePhoto(original())).rejects.toThrow('Could not decode')
    expect(decodeHeif).not.toHaveBeenCalled()
  })
  it.each(['null', 'png', 'oversize'])('rejects failed or invalid output: %s', async kind => {
    canvas.toBlob.mockImplementation(callback => {
      const blob = new Blob(['output'], { type: kind === 'png' ? 'image/png' : 'image/jpeg' })
      if (kind === 'oversize') Object.defineProperty(blob, 'size', { value: MAX_UPLOAD_BYTES + 1 })
      callback(kind === 'null' ? null : blob)
    })
    await expect(preparePhoto(original())).rejects.toThrow('under 10 MiB')
    expect(bitmap.close).toHaveBeenCalled()
  })
  it('serializes concurrent preparations and recovers after a failed photo', async () => {
    vi.mocked(imageSize).mockImplementationOnce(() => { throw new Error('corrupt') })
    const first = preparePhoto(original()), second = preparePhoto(original())
    await expect(first).rejects.toThrow('Could not read')
    await expect(second).resolves.toBeInstanceOf(File)
    expect(createImageBitmap).toHaveBeenCalledTimes(1)
  })
})
