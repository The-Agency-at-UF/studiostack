declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  interface HeifImage {
    get_width(): number
    get_height(): number
    is_primary(): boolean
    display(data: ImageData, callback: (data: ImageData | null) => void): void
    free(): void
  }
  interface HeifDecoder {
    decoder: number | null
    decode(bytes: Uint8Array): HeifImage[]
  }
  interface HeifModule {
    HeifDecoder: new () => HeifDecoder
    heif_context_free(context: number): void
  }
  export default function factory(): HeifModule
}
