import { checkPhotoDimensions } from './preparePhoto'

const loadDecoder = async () => {
  const codec = await import('@jsquash/avif/decode.js')
  await codec.init({ locateFile: () => '/photo-codecs/avif-decoder-2.1.1.wasm' })
  return codec.default
}
let decoder: ReturnType<typeof loadDecoder> | undefined

export async function decodeAvif(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const decode = await (decoder ??= loadDecoder())
  const image = await decode(bytes.slice().buffer as ArrayBuffer)
  if (!image) throw new Error('Could not convert this AVIF photo')
  checkPhotoDimensions(image.width, image.height)
  const canvas = document.createElement('canvas')
  try {
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable in this browser')
    context.putImageData(image, 0, 0)
    return canvas
  } catch (error) {
    canvas.width = canvas.height = 0
    throw error
  }
}
