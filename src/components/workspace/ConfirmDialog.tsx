'use client'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { closeWithExit } from './closeWithExit'

type ConfirmDialogProps = {
  title: string
  description: string
  /** The thing acted on (a person, brief or reservation). It is read out with the description. */
  subject?: string
  confirmLabel: string
  /** Label for the dismiss button, e.g. "Keep reservation". */
  cancelLabel?: string
  busy?: boolean
  /** Shown on the confirm button while busy; defaults to the confirm label with an ellipsis. */
  busyLabel?: string
  /** Red for actions that remove or refuse something; accent for ones that only redo work. */
  tone?: 'danger' | 'default'
  /** Where focus goes on close when the button that opened the dialog no longer exists (it was removed by the action). */
  returnFocus?: () => HTMLElement | null | undefined
  onCancel: () => void
  onConfirm: () => void
}

export default function ConfirmDialog({ title, description, subject, confirmLabel, cancelLabel = 'Cancel', busy = false, busyLabel, tone = 'danger', returnFocus, onCancel, onConfirm }: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const fallback = useRef(returnFocus)
  fallback.current = returnFocus
  const busyNow = useRef(busy)
  busyNow.current = busy
  const id = useId()
  const dismiss = () => closeWithExit(dialog.current, onCancel)

  useEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element.showModal()
    cancel.current?.focus()
    return () => {
      element.close()
      const target = trigger?.isConnected ? trigger : fallback.current?.()
      if (target) {
        if (!target.hasAttribute('tabindex') && !target.matches('a[href],button,input,select,textarea,[contenteditable]')) target.setAttribute('tabindex', '-1')
        target.focus()
      }
    }
  }, [])

  return createPortal(<dialog ref={dialog} className="ws-confirm-dialog" aria-labelledby={`${id}-title`} aria-describedby={[subject && `${id}-subject`, `${id}-description`].filter(Boolean).join(' ')} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busyNow.current) dismiss() }}
    onClick={event => { if (event.target === event.currentTarget && !busyNow.current) dismiss() }}>
    <div className="ws-confirm-content">
      <h2 id={`${id}-title`}>{title}</h2>
      {subject && <p id={`${id}-subject`} className="ws-confirm-subject">{subject}</p>}
      <p id={`${id}-description`}>{description}</p>
    </div>
    <div className="ws-confirm-actions">
      <button ref={cancel} type="button" disabled={busy} onClick={dismiss}>{cancelLabel}</button>
      <button type="button" className={tone === 'danger' ? 'ws-confirm-destructive' : 'ws-confirm-primary'} disabled={busy} onClick={onConfirm}>{busy ? busyLabel ?? `${confirmLabel}…` : confirmLabel}</button>
    </div>
  </dialog>, document.body)
}
