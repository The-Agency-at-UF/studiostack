import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TourProvider, useTour } from './TourContext'
import { tourStorageKey } from './tours'

function Replay() { const tour = useTour(); return <button onClick={() => tour?.start('workspace')}>Replay</button> }
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('TourProvider', () => {
  it('starts once for a new account and remembers a skip', async () => {
    const user = userEvent.setup()
    const view = render(<TourProvider owner="member" isAdmin={false} autoStart><Replay /></TourProvider>)
    expect(screen.getByRole('dialog', { name: 'Welcome to StudioStack' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(tourStorageKey('member'))!)).toEqual({ workspace: 'skipped' })
    view.unmount()
    render(<TourProvider owner="member" isAdmin={false} autoStart><Replay /></TourProvider>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.getByRole('dialog', { name: 'Welcome to StudioStack' })).toBeInTheDocument()
  })

  it('keeps each account separate and waits until auto-start is allowed', () => {
    localStorage.setItem(tourStorageKey('member'), JSON.stringify({ workspace: 'done' }))
    const view = render(<TourProvider owner="member" isAdmin={false} autoStart><Replay /></TourProvider>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.rerender(<TourProvider owner="other" isAdmin={false} autoStart={false}><Replay /></TourProvider>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.rerender(<TourProvider owner="other" isAdmin={false} autoStart><Replay /></TourProvider>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('still runs when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    render(<TourProvider owner="member" isAdmin={false} autoStart><Replay /></TourProvider>)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers nothing outside the workspace shell', async () => {
    render(<Replay />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
