import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'
import { useAppSession } from '../context/AppSessionContext'

const mocks = vi.hoisted(() => ({
  pathname: '/login/', push: vi.fn(), replace: vi.fn(), finish: vi.fn(), register: vi.fn(), organizations: vi.fn(),
  preview: false, clear: vi.fn(), token: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('./Header', () => ({ default: () => <nav>Workspace navigation</nav> }))
vi.mock('../auth/cognito', () => ({
  authConfiguration: () => ({ apiUrl: 'https://api.example.test' }),
  hasCallback: (url: string) => new URL(url).searchParams.has('code'), finishSignIn: mocks.finish, accessToken: mocks.token,
  isPreview: () => mocks.preview, clearSignIn: mocks.clear,
  enterPreview: () => { mocks.preview = true }, signInUrl: vi.fn(), logoutUrl: () => 'https://provider.example.test/logout',
}))
vi.mock('../api/database', () => ({ createDatabaseApiClient: () => ({ register: mocks.register, organizations: mocks.organizations }) }))
function Controls() {
  const session = useAppSession()
  return <><output>{session.mode}/{session.email}/{String(session.isAdmin)}/{session.getAccessToken ? 'token' : 'no-token'}</output>
    <button onClick={session.openPreview}>Preview</button><button onClick={() => void session.signOut?.()}>Sign out</button>
    {session.authError && <p role="alert">{session.authError}</p>}</>
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.pathname = '/login/'; mocks.preview = false
  localStorage.clear(); window.history.replaceState(null, '', '/login/')
  mocks.register.mockResolvedValue({}); mocks.organizations.mockResolvedValue({ items: [] })
  mocks.finish.mockResolvedValue({ label: 'member@example.test', subject: 'member-subject', expiresAt: Date.now() + 900_000 })
})
afterEach(cleanup)
describe('Session boundary', () => {
  it('never turns old local admin flags into an authenticated session', async () => {
    localStorage.setItem('email', 'old@example.test'); localStorage.setItem('isAdmin', 'true')
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('signed-out//false/no-token')).toBeInTheDocument()
    expect(localStorage.getItem('isAdmin')).toBeNull()
    expect(mocks.finish).not.toHaveBeenCalled()
  })
  it('gates workspace routes until sign-in or explicit preview', async () => {
    mocks.pathname = '/inventory/'
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('Opening StudioStack…')).toBeInTheDocument()
    expect(screen.queryByText('Workspace navigation')).not.toBeInTheDocument()
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login/'))
  })
  it('preview is explicit, has no real token and can sign out', async () => {
    render(<AppShell><Controls /></AppShell>)
    fireEvent.click(await screen.findByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('preview/demo@studiostack.com/true/no-token')).toBeInTheDocument()
    expect(mocks.push).toHaveBeenCalledWith('/')
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('signed-out//false/no-token')).toBeInTheDocument()
    expect(mocks.clear).toHaveBeenCalled()
  })
  it('processes callback once in StrictMode, removes query and derives role from API membership', async () => {
    window.history.replaceState(null, '', '/login/?code=test&state=test')
    mocks.organizations.mockResolvedValue({ items: [{ id: 'org-1', name: 'Studio', role: 'member' }] })
    render(<StrictMode><AppShell><Controls /></AppShell></StrictMode>)
    expect(await screen.findByText('authenticated/member@example.test/false/token')).toBeInTheDocument()
    expect(mocks.finish).toHaveBeenCalledTimes(1)
    expect(mocks.register).toHaveBeenCalledWith('member@example.test')
    expect(mocks.organizations).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('')
  })
  it('failed callback or membership lookup leaves no signed-in role/token', async () => {
    window.history.replaceState(null, '', '/login/?code=test')
    mocks.organizations.mockRejectedValue(new Error('untrusted internal details'))
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in could not be completed')
    expect(screen.getByText('signed-out//false/no-token')).toBeInTheDocument()
    expect(mocks.clear).toHaveBeenCalled()
    expect(screen.queryByText('untrusted internal details')).not.toBeInTheDocument()
  })
})
