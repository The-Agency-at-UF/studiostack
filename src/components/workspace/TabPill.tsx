'use client'

import { useLayoutEffect, useRef } from 'react'

const ACTIVE = ':scope > [aria-current=page], :scope > [aria-selected=true], :scope > [aria-pressed=true]'
// Last spot per tab bar, so a bar that remounts on navigation (Organization's
// People / Settings links) still slides from where the pill was.
const lastSpot = new Map<string, { x: number; width: number }>()

/**
 * The sliding pill behind the active tab. Place it as the first child of a
 * `.ws-pill-tabs` bar; it follows whichever sibling has aria-current="page",
 * aria-selected="true" or aria-pressed="true".
 */
export function TabPill({ id }: { id: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const pill = ref.current
    const bar = pill?.parentElement
    if (!pill || !bar) return
    const place = (animate: boolean) => {
      const active = bar.querySelector<HTMLElement>(ACTIVE)
      if (!active) { pill.style.opacity = '0'; return }
      const spot = { x: active.offsetLeft, width: active.offsetWidth }
      const current = lastSpot.get(id)
      // Already there: leave any slide in progress alone.
      if (pill.style.opacity === '1' && current && current.x === spot.x && current.width === spot.width) return
      if (!animate) pill.style.transition = 'none'
      pill.style.opacity = '1'
      pill.style.transform = `translateX(${spot.x}px)`
      pill.style.width = `${spot.width}px`
      if (!animate) { void pill.offsetWidth; pill.style.transition = '' }
      lastSpot.set(id, spot)
    }
    const remembered = lastSpot.get(id)
    if (!pill.style.width && remembered) {
      pill.style.opacity = '1'
      pill.style.transition = 'none'
      pill.style.transform = `translateX(${remembered.x}px)`
      pill.style.width = `${remembered.width}px`
      void pill.offsetWidth
      pill.style.transition = ''
    }
    place(Boolean(pill.style.width))
    // Labels and counts can change width (fonts loading, counts arriving) without the active tab changing.
    const resize = new ResizeObserver(() => place(false))
    for (const child of Array.from(bar.children)) if (child !== pill) resize.observe(child)
    return () => resize.disconnect()
  })
  return <span ref={ref} className="ws-pill-tabs-pill" aria-hidden="true" />
}
