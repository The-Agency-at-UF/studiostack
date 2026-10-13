import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EquipmentQrScanner from './EquipmentQrScanner'

const camera = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), clear: vi.fn(), constructed: vi.fn(), scanning: false, onCode: undefined as undefined | ((code: string) => void) }))
vi.mock('html5-qrcode', () => ({
  Html5QrcodeSupportedFormats: { QR_CODE: 0 },
  Html5Qrcode: class {
    constructor(id: string, options: unknown) { camera.constructed(id, options) }
    get isScanning() { return camera.scanning }
    start(constraints: unknown, config: unknown, callback: (value: string) => void) { camera.onCode = callback; return camera.start(constraints, config) }
    stop() { camera.scanning = false; return camera.stop() }
    clear() { camera.clear() }
  },
}))
beforeEach(() => {
  vi.clearAllMocks(); camera.scanning = false; camera.onCode = undefined
  camera.start.mockImplementation(async () => { camera.scanning = true })
  camera.stop.mockResolvedValue(undefined)
})
describe('equipment camera scanner', () => {
  it('requests rear-facing QR-only scanning and releases the camera on unmount', async () => {
    const view = render(<EquipmentQrScanner onCode={() => false} onCancel={vi.fn()} />)
    await screen.findByText('Position the equipment QR code in the camera view.')
    expect(camera.start).toHaveBeenCalledWith({ facingMode: 'environment' }, { fps: 10 })
    expect(camera.constructed).toHaveBeenCalledWith(expect.any(String), { formatsToSupport: [0], verbose: false })
    view.unmount()
    await waitFor(() => expect(camera.stop).toHaveBeenCalledOnce())
    expect(camera.clear).toHaveBeenCalledOnce()
  })
  it('continues after an invalid code and stops once a valid code is accepted', async () => {
    const onCode = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<EquipmentQrScanner onCode={onCode} onCancel={vi.fn()} />)
    await screen.findByText('Position the equipment QR code in the camera view.')
    camera.onCode?.('https://example.test')
    expect(camera.stop).not.toHaveBeenCalled()
    camera.onCode?.('UF-001')
    await waitFor(() => expect(camera.stop).toHaveBeenCalledOnce())
    camera.onCode?.('UF-002')
    expect(onCode).toHaveBeenCalledTimes(2)
  })
  it('releases a camera even if startup finishes after the dialog is dismissed', async () => {
    let finish!: () => void
    camera.start.mockImplementation(() => new Promise<void>(resolve => { finish = () => { camera.scanning = true; resolve() } }))
    const view = render(<EquipmentQrScanner onCode={() => true} onCancel={vi.fn()} />)
    await waitFor(() => expect(camera.start).toHaveBeenCalledOnce())
    view.unmount(); finish()
    await waitFor(() => expect(camera.stop).toHaveBeenCalledOnce())
    expect(camera.clear).toHaveBeenCalledOnce()
  })
  it('offers manual entry when camera permission is denied', async () => {
    camera.start.mockRejectedValueOnce(new Error('Permission denied'))
    render(<EquipmentQrScanner onCode={() => true} onCancel={vi.fn()} />)
    await screen.findByRole('button', { name: 'Enter ID manually' })
    expect(screen.getByRole('status')).toHaveTextContent('Allow camera access')
  })
})
