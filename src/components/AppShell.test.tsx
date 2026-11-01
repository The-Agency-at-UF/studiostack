import { StrictMode } from 'react'
import {renderToString} from 'react-dom/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppShell from './AppShell'
import { useAppSession } from '../context/AppSessionContext'

const mocks = vi.hoisted(() => ({
  pathname: '/login/', push: vi.fn(), replace: vi.fn(), finish: vi.fn(), me:vi.fn(),register: vi.fn(), organizations: vi.fn(),restore:vi.fn(),
  preview: false, clear: vi.fn(), forget:vi.fn(),token: vi.fn(), storedSession: null as { token: string; user: { label: string; subject: string; expiresAt: number } } | null,
}))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('./Header', () => ({ default: () => <nav>Workspace navigation</nav> }))
vi.mock('../auth/cognito', () => ({
  authConfiguration: () => ({ apiUrl: 'https://api.example.test' }),
  hasCallback: (url: string) => new URL(url).searchParams.has('code'), finishSignIn: mocks.finish, accessToken: mocks.token,
  getStoredSession: () => mocks.storedSession,
  isPreview: () => mocks.preview, clearSignIn: mocks.clear, forgetVerifiedSession: mocks.forget,AuthenticationUnavailable: class extends Error {},
  enterPreview: () => { mocks.preview = true }, signInUrl: vi.fn(), logoutUrl: () => 'https://provider.example.test/logout',
}))
vi.mock('../auth/password', () => ({restorePasswordSession: (...args:unknown[]) => mocks.restore(...args), signOutPasswordSession: vi.fn()}))
vi.mock('../api/database', () => ({ DatabaseApiClientError: class extends Error {constructor(public status:number){super('API error')}}, createDatabaseApiClient: () => ({me:mocks.me, register: mocks.register, organizations: mocks.organizations }) }))
function Controls() {
  const session = useAppSession()
  return <><output>{session.mode}/{session.email}/{String(session.isAdmin)}/{session.getAccessToken ? 'token' : 'no-token'}</output>
    <button onClick={session.openPreview}>Preview</button><button onClick={() => void session.signOut?.()}>Sign out</button>
    <button onClick={() => void session.completeSignIn?.({ label: 'test@example.com', subject: 'sub-test', expiresAt: Date.now() + 60000 })}>Complete Sign In</button>
    <span data-testid="current-organization">{session.selectedOrganizationId}</span>{session.authError && <p role="alert">{session.authError}</p>}</>
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.pathname = '/login/'; mocks.preview = false; mocks.storedSession = null
  localStorage.clear(); window.history.replaceState(null, '', '/login/')
  sessionStorage.clear();mocks.restore.mockImplementation(async()=>mocks.storedSession?.user??null)
  mocks.me.mockResolvedValue({}); mocks.register.mockResolvedValue({}); mocks.organizations.mockResolvedValue({ items: [] })
  mocks.finish.mockResolvedValue({ label: 'member@example.test', subject: 'member-subject', expiresAt: Date.now() + 900_000 })
})
afterEach(cleanup)
describe('Session boundary', () => {
  it('retains the authenticated shell without another bootstrap across every navbar route',async()=>{
    mocks.pathname='/'
    mocks.storedSession={token:'saved-token',user:{label:'member@example.test',subject:'member',expiresAt:Date.now()+900000}}
    const view=render(<AppShell><Controls/></AppShell>)
    await screen.findByText('authenticated/member@example.test/false/token')
    const nav=screen.getByRole('navigation')
    for(const route of ['/reports/','/production/','/inventory/','/reservations/','/alerts/','/calendar/','/create-reservation/','/']) {
      mocks.pathname=route;view.rerender(<AppShell><Controls/></AppShell>)
      expect(screen.getByRole('navigation')).toBe(nav)
      expect(screen.queryByText('Opening StudioStack…')).not.toBeInTheDocument()
    }
    expect(mocks.me).toHaveBeenCalledTimes(1);expect(mocks.organizations).toHaveBeenCalledTimes(1)
  })
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
    expect(mocks.register).not.toHaveBeenCalled()
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
  it('does not restore an authenticated session when account validation fails', async () => {
    mocks.storedSession = { token: 'invalid', user: { label: 'saved@example.test', subject: 'sub-1', expiresAt: Date.now() + 900_000 } }
    mocks.organizations.mockRejectedValue(new Error('unavailable'))
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('signed-out//false/no-token')).toBeInTheDocument()
    expect(mocks.clear).toHaveBeenCalled()
  })
  it('restores the last organization only for the verified account',async()=>{
    mocks.storedSession={token:'saved',user:{label:'saved@example.test',subject:'sub-1',expiresAt:Date.now()+900000}}
    mocks.organizations.mockResolvedValue({items:[{id:'first',role:'member',name:'First'},{id:'second',role:'admin',name:'Second'}]})
    localStorage.setItem('studiostack.organization.sub-1','second')
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('authenticated/saved@example.test/true/token')).toBeInTheDocument()
    expect(screen.getByTestId('current-organization')).toHaveTextContent('second')
  })
  it('keeps recoverable credentials when session restoration is temporarily offline',async()=>{
    mocks.restore.mockRejectedValue(new TypeError('offline'))
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('signed-out//false/no-token')).toBeInTheDocument()
    expect(mocks.forget).toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
  })
  it('does not authenticate after failed SDK restoration',async()=>{
    mocks.restore.mockRejectedValue(new Error('invalid token'))
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('signed-out//false/no-token')).toBeInTheDocument()
    expect(mocks.clear).toHaveBeenCalled()
  })
  it('returns to a requested local page after signing in',async()=>{
    sessionStorage.setItem('studiostack.return','/inventory/?category=Audio')
    mocks.storedSession={token:'saved',user:{label:'saved@example.test',subject:'sub-1',expiresAt:Date.now()+900000}}
    render(<AppShell><Controls /></AppShell>)
    await screen.findByText('authenticated/saved@example.test/false/token')
    expect(mocks.replace).toHaveBeenCalledWith('/inventory/?category=Audio')
  })
  it('never redirects to an external path stored during login', async () => {
    sessionStorage.setItem('studiostack.return','//evil.example/steal')
    mocks.storedSession = {token:'saved-token',user:{label:'saved@example.test',subject:'sub-1',expiresAt:Date.now()+900000}}
    render(<AppShell><Controls /></AppShell>)
    await screen.findByText('authenticated/saved@example.test/false/token')
    expect(mocks.replace).not.toHaveBeenCalledWith('//evil.example/steal')
  })
  it('restores stored session immediately without redirecting to login', async () => {
    mocks.pathname = '/'
    mocks.storedSession = { token: 'saved-token', user: { label: 'saved@example.test', subject: 'sub-1', expiresAt: Date.now() + 900_000 } }
    render(<AppShell><Controls /></AppShell>)
    expect(await screen.findByText('authenticated/saved@example.test/false/token')).toBeInTheDocument()
    expect(mocks.replace).not.toHaveBeenCalledWith('/login/')
  })
  it('redirects to root when completeSignIn finishes without a return path', async () => {
    render(<AppShell><Controls /></AppShell>)
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Sign In' }))
    expect(await screen.findByText('authenticated/test@example.com/false/token')).toBeInTheDocument()
    expect(mocks.replace).toHaveBeenCalledWith('/')
  })
})

describe('Preview document hydration',()=>{
  it('renders the same initial document before reading browser preview storage',()=>{
    mocks.pathname='/';mocks.preview=true;
    const html=renderToString(<AppShell><Controls/></AppShell>);
    expect(html).toContain('Opening StudioStack');expect(html).not.toContain('Workspace navigation');
  });
  it('restores preview after mounting without bootstrapping a real account',async()=>{
    mocks.pathname='/';mocks.preview=true;
    render(<AppShell><Controls/></AppShell>);
    expect(await screen.findByText('preview/demo@studiostack.com/true/no-token')).toBeInTheDocument();
    expect(mocks.me).not.toHaveBeenCalled();expect(mocks.replace).not.toHaveBeenCalledWith('/login/');
  });
});
