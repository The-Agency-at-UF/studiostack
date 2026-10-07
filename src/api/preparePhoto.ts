import { imageSize } from 'image-size'

export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024
export const MAX_DECODED_PIXELS = 50_000_000
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_PHOTO_EDGE = 2560
const heifTypes = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif'])
const inputTypes = new Set(['jpg', 'png', 'webp', ...heifTypes])

export function checkPhotoDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width * height > MAX_DECODED_PIXELS) {
    throw new Error('Photo must contain no more than 50 megapixels')
  }
}

async function prepare(file: File): Promise<File> {
  if (!file.size || file.size > MAX_ORIGINAL_BYTES) throw new Error('Choose a photo between 1 byte and 50 MiB')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let info: ReturnType<typeof imageSize>
  try { info = imageSize(bytes) } catch { throw new Error('Could not read this photo') }
  const type = info.type ?? ''
  if (!inputTypes.has(type)) throw new Error('Choose JPEG, PNG, WebP, HEIC/HEIF, or AVIF')
  // Inspect the header before decoding, including HEIF tiles/auxiliary images.
  for (const image of [info, ...(info.images ?? [])]) checkPhotoDimensions(image.width, image.height)
  let source: ImageBitmap | HTMLCanvasElement
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    if (!heifTypes.has(type)) throw new Error('Could not decode this photo; try another image')
    if (type === 'avif') {
      const { decodeAvif } = await import('./decodeAvif')
      source = await decodeAvif(bytes)
    } else {
      const { decodeHeif } = await import('./decodeHeif')
      source = await decodeHeif(bytes)
    }
  }
  const canvas = document.createElement('canvas')
  try {
    checkPhotoDimensions(source.width, source.height)
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(source.width, source.height))
    canvas.width = Math.max(1, Math.round(source.width * scale))
    canvas.height = Math.max(1, Math.round(source.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable in this browser')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    // Re-encoding removes original EXIF/GPS metadata; transparency becomes white.
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.type !== 'image/jpeg' || !blob.size || blob.size > MAX_UPLOAD_BYTES) {
      throw new Error('Could not prepare a JPEG under 10 MiB; try a smaller photo')
    }
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: blob.type })
  } finally {
    canvas.width = canvas.height = 0
    if ('close' in source) source.close()
    else source.width = source.height = 0
  }
}

// Avoid concurrently allocating several phone-sized decoded images.
let pending: Promise<unknown> = Promise.resolve()
export function preparePhoto(file: File): Promise<File> {
  const result = pending.then(() => prepare(file))
  pending = result.catch(() => undefined)
  return result
}
