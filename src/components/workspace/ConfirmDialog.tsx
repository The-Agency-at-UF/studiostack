'use client'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ConfirmDialog.css'

type ConfirmDialogProps = {
  title: string
  description: string
  subject?: string
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({ title, description, subject, confirmLabel, busy = false, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    cancel.current?.focus()
    return () => {
      element.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  return createPortal(<dialog ref={dialog} className="ws-confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <div className="ws-confirm-content">
      <h2 id={`${id}-title`}>{title}</h2>
      {subject && <p className="ws-confirm-subject">{subject}</p>}
      <p id={`${id}-description`}>{description}</p>
    </div>
    <div className="ws-confirm-actions">
      <button ref={cancel} type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="ws-confirm-destructive" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : confirmLabel}</button>
    </div>
  </dialog>, document.body)
}
