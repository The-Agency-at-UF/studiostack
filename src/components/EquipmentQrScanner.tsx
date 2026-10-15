import { useEffect, useId, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'

/** Camera starts only after the user chooses Scan QR code in the parent form. */
export default function EquipmentQrScanner({ onCode, onCancel }: { onCode: (value: string) => boolean; onCancel: () => void }) {
  const id = `equipment-qr-${useId().replace(/:/g, '')}`
  const onCodeRef = useRef(onCode)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => { onCodeRef.current = onCode }, [onCode])
  useEffect(() => {
    let disposed = false
    let scanner: Html5Qrcode | undefined
    let released: Promise<void> | undefined
    const starting = (async () => {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      if (disposed) return
      scanner = new Html5Qrcode(id, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false })
      await scanner.start({ facingMode: 'environment' }, { fps: 10 }, value => {
        if (!disposed && onCodeRef.current(value)) { disposed = true; void release() }
      }, () => { /* A frame without a QR code is expected. */ })
      if (!disposed) setReady(true)
    })()
    function release() {
      return released ??= (async () => {
        await starting.catch(() => undefined)
        if (scanner?.isScanning) await scanner.stop().catch(() => undefined)
        const stream = document.getElementById(id)?.querySelector('video')?.srcObject
        if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop())
        try { scanner?.clear() } catch { /* Container may already be unmounted. */ }
      })()
    }
    starting.catch(() => {
      if (!disposed) setError('Could not open the camera. Allow camera access over HTTPS or localhost, or enter the equipment ID manually.')
      void release()
    })
    return () => { disposed = true; void release() }
  }, [id])
  return <div className="item-qr-scanner">
    <p role="status">{error || (ready ? 'Position the equipment QR code in the camera view.' : 'Opening camera…')}</p>
    <div id={id} className="item-camera-view" />
    <button type="button" className="item-secondary" onClick={onCancel}>{error ? 'Enter ID manually' : 'Stop camera'}</button>
  </div>
}
