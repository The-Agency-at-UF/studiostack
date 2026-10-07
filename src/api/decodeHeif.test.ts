import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { decodeHeif } from './decodeHeif'

const mocks = vi.hoisted(() => ({ decode: vi.fn(), freeContext: vi.fn(), display: vi.fn(), free: vi.fn() }))
vi.mock('libheif-js/libheif-wasm/libheif-bundle.mjs', () => ({ default: () => ({
  HeifDecoder: class { decoder = 123; decode = mocks.decode }, heif_context_free: mocks.freeContext,
}) }))
const image = { get_width: () => 20, get_height: () => 10, is_primary: () => true, display: mocks.display, free: mocks.free }
const context = { createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(800) })), putImageData: vi.fn() }
const canvas = { width: 0, height: 0, getContext: () => context }
beforeEach(() => {
  mocks.decode.mockReturnValue([image])
  mocks.display.mockImplementation((data, callback) => callback(data))
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
})
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

it('decodes the primary image and releases WASM handles and context', async () => {
  expect(await decodeHeif(new Uint8Array([1]))).toBe(canvas)
  expect(context.putImageData).toHaveBeenCalled()
  expect(mocks.free).toHaveBeenCalled()
  expect(mocks.freeContext).toHaveBeenCalledWith(123)
})
it('checks actual dimensions before allocating pixel memory', async () => {
  mocks.decode.mockReturnValueOnce([{ ...image, get_width: () => 10000, get_height: () => 6000 }])
  await expect(decodeHeif(new Uint8Array([1]))).rejects.toThrow('50 megapixels')
  expect(context.createImageData).not.toHaveBeenCalled()
  expect(mocks.freeContext).toHaveBeenCalled()
})
it('releases resources after a failed conversion', async () => {
  mocks.display.mockImplementationOnce((_data, callback) => callback(null))
  await expect(decodeHeif(new Uint8Array([1]))).rejects.toThrow('Could not convert')
  expect(canvas.width).toBe(0)
  expect(mocks.free).toHaveBeenCalled()
  expect(mocks.freeContext).toHaveBeenCalled()
})
it('rejects empty decoder results and releases the context', async () => {
  mocks.decode.mockReturnValueOnce([])
  await expect(decodeHeif(new Uint8Array([1]))).rejects.toThrow('Could not decode')
  expect(mocks.freeContext).toHaveBeenCalled()
})
