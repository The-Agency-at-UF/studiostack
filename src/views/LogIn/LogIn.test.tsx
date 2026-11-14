import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LogIn from './LogIn'

describe('StudioStack sign-in', () => {
  it('renders the account sign-in action without a preview link', () => {
    const onSignIn = vi.fn()
    render(<LogIn onSignIn={onSignIn} />)
    expect(screen.getByText('StudioStack', { selector: '.login-wordmark' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to sign in' }))
    expect(onSignIn).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /preview/i })).not.toBeInTheDocument()
  })
  it('does not claim UF SSO works or collect passwords on the site', () => {
    render(<LogIn onSignIn={vi.fn()} />)
    expect(screen.getAllByText('Coming soon')).toHaveLength(3)
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    for (const name of ['Continue with Google', 'Continue with Apple', 'Institutional SSO']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.queryByRole('button', { name: /sign up/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Need access?')).not.toBeInTheDocument()
  })
  it('prevents repeat clicks while signing in and announces errors', () => {
    render(<LogIn onSignIn={vi.fn()} busy error="Sign-in failed. Please try again." />)
    expect(screen.getByRole('button', { name: 'Connecting securely…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Connecting')
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed')
  })
  it('routes configured providers individually', () => {
    const onSignIn = vi.fn()
    render(<LogIn onSignIn={onSignIn} providers={[
      { id: 'google', identityProvider: 'Google' }, { id: 'apple', identityProvider: 'SignInWithApple' }, { id: 'saml', identityProvider: 'UF' },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }))
    fireEvent.click(screen.getByRole('button', { name: 'Institutional SSO' }))
    expect(onSignIn.mock.calls).toEqual([['google'], ['apple'], ['saml']])
  })
  it('disables configured providers while busy or when the website is unconfigured', () => {
    const providers = [{ id: 'google' as const, identityProvider: 'Google' }]
    const { rerender } = render(<LogIn onSignIn={vi.fn()} providers={providers} busy />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
    rerender(<LogIn onSignIn={vi.fn()} providers={providers} configured={false} />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
  })
  it('disables sign-in when hosting auth is not configured', () => {
    render(<LogIn onSignIn={vi.fn()} configured={false} />)
    expect(screen.getByRole('button', { name: 'Continue to sign in' })).toBeDisabled()
  })
  it('explains missing organization access without granting admin rights', () => {
    const onSignOut = vi.fn()
    render(<LogIn onSignIn={vi.fn()} onSignOut={onSignOut} authenticated label="Invited user" accountActions={<p>Onboarding steps</p>} />)
    expect(screen.getByRole('heading', { name: 'You’re signed in.' })).toBeInTheDocument()
    expect(screen.getByText('Onboarding steps')).toBeInTheDocument()
    expect(screen.queryByText('Your workspaces')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open Production/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create organization|make admin/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of this account' }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })
  it('shows the current workspace and links to the account page to switch',()=>{render(<LogIn onSignIn={vi.fn()} authenticated selectedOrganizationId="two" organizations={[{id:'one',slug:'one',name:'First',role:'member'},{id:'two',slug:'two',name:'Second',role:'admin'}]}/>);expect(screen.queryByRole('combobox')).not.toBeInTheDocument();expect(screen.getByText('Second · admin')).toBeInTheDocument();expect(screen.getByRole('link',{name:'Switch workspace'})).toHaveAttribute('href','/account')})
  it('displays memberships and roles returned by the backend', () => {
    render(<LogIn onSignIn={vi.fn()} authenticated organizations={[{ id: 'org', slug: 'studio', name: 'Invited studio', role: 'member' }]} />)
    expect(screen.getByText('Invited studio · member')).toBeInTheDocument()
    expect(screen.queryByRole('link',{name:'Switch workspace'})).not.toBeInTheDocument()
  })
  it('opens live Production after sign-in', () => {
    render(<LogIn onSignIn={vi.fn()} authenticated organizations={[{ id: 'org', slug: 'studio', name: 'Real studio', role: 'owner' }]} />)
    expect(screen.getByRole('link', { name: 'Open Production' })).toHaveAttribute('href', '/production')
    expect(screen.queryByRole('button', { name: 'Open workspace preview' })).not.toBeInTheDocument()
  })

})
