'use client'
import { useEffect, useRef } from 'react'

/**
 * Holds the page while a form has unsaved work: closing the tab asks the browser's own question, and
 * same-site link clicks call `onBlocked` with a function that follows the link once the person agrees.
 * Pair it with a ConfirmDialog ("Discard unsaved changes?") that calls the function on confirm.
 */
export function useUnsavedGuard(dirty: boolean, onBlocked: (proceed: () => void) => void) {
  const blocked = useRef(onBlocked), bypass = useRef(false)
  blocked.current = onBlocked
  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    const click = (event: MouseEvent) => {
      if (bypass.current) { bypass.current = false; return }
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return
      const next = new URL(target.href, window.location.href)
      if (next.origin !== window.location.origin) return
      if (next.pathname === window.location.pathname && next.search === window.location.search) return
      event.preventDefault(); event.stopPropagation()
      blocked.current(() => { bypass.current = true; window.setTimeout(() => { if (target.isConnected) target.click(); else { bypass.current = false; window.location.assign(next.href) } }, 0) })
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true) }
  }, [dirty])
}
