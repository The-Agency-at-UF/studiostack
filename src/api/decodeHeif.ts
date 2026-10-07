import { checkPhotoDimensions } from './preparePhoto'

const loadHeif = () => import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(({ default: factory }) => factory())
let module: ReturnType<typeof loadHeif> | undefined

/** Bundled WASM fallback: no CDN, API keys, or original-photo network requests. */
export async function decodeHeif(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const heif = await (module ??= loadHeif())
  const decoder = new heif.HeifDecoder()
  let images: ReturnType<typeof decoder.decode> = []
  const canvas = document.createElement('canvas')
  try {
    images = decoder.decode(bytes)
    const image = images.find(image => image.is_primary()) ?? images[0]
    if (!image) throw new Error('Could not decode this HEIC/HEIF photo')
    const width = image.get_width(), height = image.get_height()
    checkPhotoDimensions(width, height)
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable in this browser')
    const rgba = context.createImageData(canvas.width, canvas.height)
    await new Promise<void>((resolve, reject) => image.display(rgba, decoded => {
      if (!decoded) reject(new Error('Could not convert this HEIC/HEIF photo'))
      else { context.putImageData(decoded, 0, 0); resolve() }
    }))
    return canvas
  } catch (error) {
    canvas.width = canvas.height = 0
    throw error
  } finally {
    for (const image of images) image.free()
    if (decoder.decoder) heif.heif_context_free(decoder.decoder)
  }
}
