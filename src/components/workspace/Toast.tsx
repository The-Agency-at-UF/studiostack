'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type ToastKind = 'success' | 'error'
export type ToastOptions = {
  /** Toasts with the same id replace each other, so one area shows only its latest outcome. */
  id?: string
  action?: { label: string; onClick: () => void }
}
type ToastItem = { key: number; id: string; kind: ToastKind; message: string; action?: ToastOptions['action'] }
export type ToastApi = {
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
  dismiss: (id: string) => void
}

/** Successes fade after a few seconds; errors stay until dismissed or replaced. */
export const SUCCESS_TOAST_MS = 4000
const MAX_TOASTS = 3
const noop: ToastApi = { success: () => {}, error: () => {}, dismiss: () => {} }
const ToastContext = createContext<ToastApi | null>(null)

/** Shows short confirmations and failures for actions anywhere in the app. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noop
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const next = useRef(0)
  const dismiss = useCallback((id: string) => setToasts(list => list.filter(t => t.id !== id)), [])
  const show = useCallback((kind: ToastKind, message: string, options: ToastOptions = {}) => {
    const key = ++next.current, id = options.id ?? `toast-${key}`
    setToasts(list => [...list.filter(t => t.id !== id), { key, id, kind, message, action: options.action }].slice(-MAX_TOASTS))
  }, [])
  const api = useMemo<ToastApi>(() => ({ success: (m, o) => show('success', m, o), error: (m, o) => show('error', m, o), dismiss }), [show, dismiss])
  // Children stay the provider's only child so wrapping a tree never changes how React reconciles it.
  return <><ToastContext.Provider value={api}>{children}</ToastContext.Provider><ToastViewport toasts={toasts} dismiss={dismiss} /></>
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const newest = toasts[toasts.length - 1]?.key
  // A manual popover sits in the top layer, so toasts stay visible above an open modal dialog.
  // Re-showing it on each new toast moves it above any dialog opened since.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof el.showPopover !== 'function') return
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual')
    try { if (el.matches(':popover-open')) el.hidePopover(); if (newest !== undefined) el.showPopover() } catch { /* Older browsers keep the fixed-position fallback. */ }
  }, [newest])
  return <div ref={ref} className="ws-toasts" aria-label="Notifications">
    {toasts.map(t => <ToastCard key={t.key} toast={t} dismiss={dismiss} />)}
  </div>
}

function ToastCard({ toast, dismiss }: { toast: ToastItem; dismiss: (id: string) => void }) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (toast.kind === 'error' || paused) return
    const timer = window.setTimeout(() => dismiss(toast.id), SUCCESS_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast.kind, toast.id, paused, dismiss])
  const pause = () => setPaused(true), resume = () => setPaused(false)
  return <div className={`ws-toast ws-toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'} onMouseEnter={pause} onMouseLeave={resume} onFocus={pause} onBlur={resume}>
    <span className="ws-toast-icon" aria-hidden="true">{toast.kind === 'error' ? '!' : '✓'}</span>
    <p>{toast.message}</p>
    {toast.action && <button type="button" className="ws-toast-action" onClick={() => { dismiss(toast.id); toast.action?.onClick() }}>{toast.action.label}</button>}
    <button type="button" className="ws-toast-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button>
  </div>
}
