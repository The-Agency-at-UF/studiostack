/** Moves to a details panel's heading: scrolls it into view (it sits below the list on narrow screens) and focuses it. */
export function revealPanel(selector: string) {
  requestAnimationFrame(() => {
    const heading = document.querySelector<HTMLElement>(selector)
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
    heading.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    heading.focus({ preventScroll: true })
  })
}
