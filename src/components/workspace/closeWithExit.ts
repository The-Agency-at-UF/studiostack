/**
 * Plays an element's exit animation, then runs `done`.
 *
 * Marking the element with `data-closing` lets its stylesheet swap in an exit animation. When nothing
 * animates (reduced motion, no stylesheet, or a test environment without the Web Animations API),
 * `done` runs immediately so closing never waits on motion.
 */
export function closeWithExit(element: Element | null | undefined, done: () => void) {
  if (!element) { done(); return }
  if (element.hasAttribute('data-closing')) return
  element.setAttribute('data-closing', '')
  const running = typeof element.getAnimations === 'function' ? element.getAnimations() : []
  if (!running.length) { done(); return }
  void Promise.all(running.map(animation => animation.finished.catch(() => undefined))).then(done)
}
