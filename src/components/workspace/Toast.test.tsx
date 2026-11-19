import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUCCESS_TOAST_MS, useToast } from './Toast'
import type { ToastOptions } from './Toast'

function Trigger({ kind, message, options }: { kind: 'success' | 'error'; message: string; options?: ToastOptions }) {
  const toast = useToast()
  return <button onClick={() => toast[kind](message, options)}>Show {message}</button>
}

describe('toasts', () => {
  afterEach(() => vi.useRealTimers())

  it('announces a success and dismisses it after a few seconds', () => {
    vi.useFakeTimers()
    render(<Trigger kind="success" message="Brief submitted for review." />)
    fireEvent.click(screen.getByText('Show Brief submitted for review.'))
    expect(screen.getByRole('status')).toHaveTextContent('Brief submitted for review.')
    act(() => { vi.advanceTimersByTime(SUCCESS_TOAST_MS) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps a success while the pointer rests on it', () => {
    vi.useFakeTimers()
    render(<Trigger kind="success" message="Saved name." />)
    fireEvent.click(screen.getByText('Show Saved name.'))
    fireEvent.mouseEnter(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(SUCCESS_TOAST_MS * 2) })
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByRole('status'))
    act(() => { vi.advanceTimersByTime(SUCCESS_TOAST_MS) })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps an error until it is dismissed', () => {
    vi.useFakeTimers()
    render(<Trigger kind="error" message="The request failed." />)
    fireEvent.click(screen.getByText('Show The request failed.'))
    act(() => { vi.advanceTimersByTime(SUCCESS_TOAST_MS * 5) })
    expect(screen.getByRole('alert')).toHaveTextContent('The request failed.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('runs an action and closes the toast', () => {
    const reload = vi.fn()
    render(<Trigger kind="error" message="Could not save." options={{ action: { label: 'Reload', onClick: reload } }} />)
    fireEvent.click(screen.getByText('Show Could not save.'))
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('replaces a toast with the same id', () => {
    render(<><Trigger kind="error" message="Failed." options={{ id: 'brief' }} /><Trigger kind="success" message="Saved." options={{ id: 'brief' }} /></>)
    fireEvent.click(screen.getByText('Show Failed.'))
    fireEvent.click(screen.getByText('Show Saved.'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Saved.')
  })

  it('shows at most three at once', () => {
    render(<Trigger kind="error" message="Oops" />)
    for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Show Oops'))
    expect(screen.getAllByRole('alert')).toHaveLength(3)
  })
})
