import { afterEach, expect, it, vi } from 'vitest'
import { decodeAvif } from './decodeAvif'

const mocks = vi.hoisted(() => ({ decode: vi.fn(), init: vi.fn() }))
vi.mock('@jsquash/avif/decode.js', () => ({ default: mocks.decode, init: mocks.init }))
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

it('loads the self-hosted AVIF WASM decoder and produces a canvas', async () => {
  const data = { width: 20, height: 10 }
  mocks.decode.mockResolvedValueOnce(data)
  const context = { putImageData: vi.fn() }
  const canvas = { width: 0, height: 0, getContext: () => context }
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement)
  expect(await decodeAvif(new Uint8Array([1]))).toBe(canvas)
  expect(mocks.init).toHaveBeenCalled()
  expect(mocks.init.mock.calls[0][0].locateFile()).toBe('/photo-codecs/avif-decoder-2.1.1.wasm')
  expect(context.putImageData).toHaveBeenCalledWith(data, 0, 0)
})
it('rejects oversized decoded output before canvas allocation', async () => {
  mocks.decode.mockResolvedValueOnce({ width: 10000, height: 6000 })
  const create = vi.spyOn(document, 'createElement')
  await expect(decodeAvif(new Uint8Array([1]))).rejects.toThrow('50 megapixels')
  expect(create).not.toHaveBeenCalled()
})
it('rejects corrupt AVIF data', async () => {
  mocks.decode.mockResolvedValueOnce(null)
  await expect(decodeAvif(new Uint8Array([1]))).rejects.toThrow('Could not convert')
})
