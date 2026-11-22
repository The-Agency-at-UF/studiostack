import { useEffect, useId, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'

/** Camera starts only after the user chooses Scan QR code in the parent form. */
/** `onCode` returns false for a code it can't use; the scanner keeps looking and says why (once every 2 seconds). */
export default function EquipmentQrScanner({ onCode, onCancel, rejectedMessage = 'That QR code isn’t one this form can use. Try another label.' }: { onCode: (value: string) => boolean; onCancel: () => void; rejectedMessage?: string }) {
  const id = `equipment-qr-${useId().replace(/:/g, '')}`
  const onCodeRef = useRef(onCode)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [rejected, setRejected] = useState(false)
  const lastRejected = useRef(0)
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
        if (disposed) return
        if (onCodeRef.current(value)) { disposed = true; void release(); return }
        if (Date.now() - lastRejected.current > 2000) { lastRejected.current = Date.now(); setRejected(true) }
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
      if (!disposed) setError('Could not open the camera. Allow camera access over HTTPS or localhost, or enter the equipment code manually.')
      void release()
    })
    return () => { disposed = true; void release() }
  }, [id])
  return <div className="item-qr-scanner">
    <p role="status">{error || (rejected ? rejectedMessage : ready ? 'Position the equipment QR code in the camera view.' : 'Opening camera…')}</p>
    <div id={id} className="item-camera-view" />
    <button type="button" className="item-secondary" onClick={onCancel}>{error ? 'Type the equipment code' : 'Stop camera'}</button>
  </div>
}
