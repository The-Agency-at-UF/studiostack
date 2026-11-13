import { describe, expect, it, vi } from 'vitest'
import { closeWithExit } from './closeWithExit'

describe('closeWithExit', () => {
  it('closes at once when nothing animates', () => {
    const element = document.createElement('div'), done = vi.fn()
    closeWithExit(element, done)
    expect(element).toHaveAttribute('data-closing')
    expect(done).toHaveBeenCalledOnce()
  })

  it('waits for the exit animation, and ignores repeat requests while it plays', async () => {
    const element = document.createElement('div'), done = vi.fn()
    let finish!: () => void
    const finished = new Promise<void>(resolve => { finish = resolve })
    element.getAnimations = () => [{ finished } as unknown as Animation]
    closeWithExit(element, done)
    closeWithExit(element, done)
    expect(done).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce())
  })

  it('still closes when the exit animation is cancelled', async () => {
    const element = document.createElement('div'), done = vi.fn()
    const finished = Promise.reject(new DOMException('cancelled', 'AbortError'))
    element.getAnimations = () => [{ finished } as unknown as Animation]
    closeWithExit(element, done)
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce())
  })

  it('runs done when there is no element to animate', () => {
    const done = vi.fn()
    closeWithExit(null, done)
    expect(done).toHaveBeenCalledOnce()
  })
})
