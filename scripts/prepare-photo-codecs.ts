import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Generate the self-hosted AVIF decoder asset; never commit generated binaries.
const destination = fileURLToPath(new URL('../public/photo-codecs/', import.meta.url))
mkdirSync(destination, { recursive: true })
copyFileSync(
  fileURLToPath(new URL('../node_modules/@jsquash/avif/codec/dec/avif_dec.wasm', import.meta.url)),
  `${destination}/avif-decoder-2.1.1.wasm`,
)
for (const [source, name] of [
  ['@jsquash/avif/LICENSE', 'avif-LICENSE.txt'],
  ['libheif-js/LICENSE', 'libheif-LICENSE.txt'],
  ['libheif-js/libheif-wasm/LICENSE', 'libheif-wasm-LICENSE.txt'],
]) {
  copyFileSync(fileURLToPath(new URL(`../node_modules/${source}`, import.meta.url)), `${destination}/${name}`)
}
