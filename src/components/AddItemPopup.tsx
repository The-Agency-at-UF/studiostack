import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { HiOutlinePlus, HiOutlineQrCode, HiOutlineCamera, HiOutlinePhoto, HiOutlineXMark } from 'react-icons/hi2'
import { preparePhoto } from '../api/preparePhoto'
import { uploadPreparedPhoto } from '../api/photos'
import EquipmentQrScanner from './EquipmentQrScanner'

export interface ItemDetails { equipmentId?: string; photoKey?: string }
export type AddInventoryItem = (name: string, category: string, availability: string, details?: ItemDetails) => void | Promise<void>
const validEquipmentId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)

function AddItemForm({ addItem, categoryList, getAccessToken, close }: {
  addItem: AddInventoryItem; categoryList: string[]; getAccessToken?: () => Promise<string>; close: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const mounted = useRef(true)
  const generation = useRef(0)
  const busyRef = useRef(false)
  const uploadedKey = useRef<string | undefined>(undefined)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [processing, setProcessing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const uploadConnected = Boolean(process.env.NEXT_PUBLIC_PHOTO_UPLOAD_API_URL && getAccessToken)

  useEffect(() => {
    const photoGeneration = generation
    mounted.current = true
    if (!triggerRef.current && document.activeElement instanceof HTMLElement) triggerRef.current = document.activeElement
    const element = dialogRef.current
    if (element && !element.open) {
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
    }
    nameRef.current?.focus()
    return () => { mounted.current = false; photoGeneration.current++; triggerRef.current?.focus() }
  }, [])
  useEffect(() => {
    if (!photo) { setPreview(''); return }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function selectPhoto(file?: File) {
    if (!file) return
    const version = ++generation.current
    uploadedKey.current = undefined
    setPhoto(null); setError(''); setProcessing(true); setStatus('Preparing photo…')
    try {
      const prepared = await preparePhoto(file)
      if (mounted.current && version === generation.current) {
        setPhoto(prepared); setStatus('Photo ready. It has not been uploaded yet.')
      }
    } catch (cause) {
      if (mounted.current && version === generation.current) { setError(cause instanceof Error ? cause.message : 'Could not prepare this photo.'); setStatus('') }
    } finally { if (mounted.current && version === generation.current) setProcessing(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || processing || scanning) return
    setError('')
    if (!name.trim() || !categoryList.includes(category)) { setError('Enter an item name and select a category.'); return }
    if (equipmentId.trim() && !validEquipmentId(equipmentId.trim())) { setError('Use an equipment ID of 1–128 letters, numbers, dots, underscores or hyphens—not a website link.'); return }
    if (photo && !uploadConnected) { setError('S3 upload needs the authenticated photo API and Cognito sign-in. Remove the photo to add this local item without uploading.'); return }
    busyRef.current = true; setBusy(true)
    try {
      if (photo && !uploadedKey.current) {
        setStatus('Uploading photo to S3…')
        const token = await getAccessToken!()
        const uploaded = await uploadPreparedPhoto(photo, token)
        uploadedKey.current = uploaded.key
      }
      setStatus('Saving item…')
      await addItem(name.trim(), category, 'available', {
        ...(equipmentId.trim() ? { equipmentId: equipmentId.trim() } : {}),
        ...(uploadedKey.current ? { photoKey: uploadedKey.current } : {}),
      })
      if (mounted.current) close()
    } catch (cause) {
      if (mounted.current) { setError(cause instanceof Error ? cause.message : 'Could not add this item.'); setStatus(uploadedKey.current ? 'Photo uploaded. Retry saving to reuse it; closing leaves an unattached photo in S3.' : '') }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  return <dialog ref={dialogRef} className="item-dialog" aria-labelledby="add-item-title" onCancel={event => { if (busy) event.preventDefault(); else close() }}>
    <div className="item-dialog-heading"><div><p className="eyebrow">Inventory</p><h2 id="add-item-title">Add item</h2></div><button type="button" aria-label="Close add item" disabled={busy} onClick={close}><HiOutlineXMark /></button></div>
    <form onSubmit={submit} className="item-form">
      <fieldset disabled={busy}>
        <div className="item-basic-fields"><label>Item name<input ref={nameRef} required maxLength={120} placeholder="e.g. Sony FX3 camera" value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Category<select required value={category} onChange={event => setCategory(event.target.value)}><option value="">Select category</option>{categoryList.map(item => <option key={item}>{item}</option>)}</select></label></div>
        <section className="item-form-section" aria-labelledby="item-code-heading"><div className="item-section-title"><HiOutlineQrCode /><div><h3 id="item-code-heading">Equipment QR code</h3><p>Scan an existing label or leave blank to generate a new ID.</p></div></div>
          <div className="item-id-row"><label>Equipment ID<input maxLength={128} placeholder="Generated automatically if blank" value={equipmentId} onChange={event => setEquipmentId(event.target.value)} /></label><button type="button" className="item-secondary" disabled={scanning} onClick={() => { setScanning(true); setError('') }}><HiOutlineQrCode /> Scan QR code</button></div>
          {scanning && <EquipmentQrScanner onCancel={() => setScanning(false)} onCode={value => {
            if (!validEquipmentId(value.trim())) { setError('This QR code is not an equipment ID. Enter a label ID manually; website links are not accepted.'); return false }
            setEquipmentId(value.trim()); setScanning(false); setError(''); setStatus('QR code scanned. Review the item details before saving.'); return true
          }} />}
        </section>
        <section className="item-form-section" aria-labelledby="item-photo-heading"><div className="item-section-title"><HiOutlinePhoto /><div><h3 id="item-photo-heading">Equipment photo <span>Optional</span></h3><p>JPEG, PNG, WebP, HEIC/HEIF or AVIF · up to 50 MiB.</p></div></div>
          <div className="item-photo-area">{preview ? <img src={preview} alt="Selected equipment photo preview" /> : <div className="item-photo-placeholder"><HiOutlinePhoto /><span>No photo selected</span></div>}
            <div className="item-photo-options"><label className="item-secondary"><HiOutlinePhoto /> Choose photo<input aria-label="Choose equipment photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif" disabled={processing} onChange={event => { void selectPhoto(event.target.files?.[0]); event.target.value = '' }} /></label>
              <label className="item-secondary"><HiOutlineCamera /> Take photo<input aria-label="Take equipment photo" type="file" accept="image/*" capture="environment" disabled={processing} onChange={event => { void selectPhoto(event.target.files?.[0]); event.target.value = '' }} /></label>
              {photo && <button type="button" className="item-remove-photo" onClick={() => { generation.current++; setPhoto(null); uploadedKey.current = undefined; setStatus(''); setError('') }}>Remove photo</button>}
              {photo && <p>{photo.name} · {(photo.size / 1024 / 1024).toFixed(2)} MiB prepared JPEG</p>}
            </div></div>
          <p className="item-upload-note">Photos are resized to a 2560px long edge and converted to JPEG before upload. Original location metadata is removed.</p>
          {!uploadConnected && <p className="item-connection-note">Preview available. S3 upload is not connected to authenticated sign-in in this local app yet.</p>}
        </section>
      </fieldset>
      {status && <p className="item-progress" role="status">{status}</p>}
      {error && <p className="item-form-error" role="alert">{error}</p>}
      <div className="item-form-actions"><button type="button" className="item-secondary" disabled={busy} onClick={close}>Cancel</button><button type="submit" className="workspace-modal-submit" disabled={busy || processing || scanning}>{busy ? 'Saving…' : photo ? 'Upload photo & add item' : 'Add item'}</button></div>
      <p className="item-local-note">Inventory currently uses the local preview store, not RDS. S3 photos, once connected, are real uploads.</p>
    </form>
  </dialog>
}

export default function AddItemPopup(props: { addItem: AddInventoryItem; categoryList: string[]; getAccessToken?: () => Promise<string> }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" className="add-item-trigger" aria-label="Add item" onClick={() => setOpen(true)}><HiOutlinePlus /></button>{open && <AddItemForm {...props} close={() => setOpen(false)} />}</>
}
