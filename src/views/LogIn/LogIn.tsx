'use client'

import Link from 'next/link'
import { HiOutlineArrowRight, HiOutlineArrowUpRight, HiOutlineLockClosed, HiOutlineCheckCircle, HiOutlineBuildingOffice2 } from 'react-icons/hi2'
import { FcGoogle } from 'react-icons/fc'
import { SiApple } from 'react-icons/si'
import logo from '../../assets/StudioStack.png'
import type { ApiOrganization } from '../../types/database-api'
import type { LoginProvider, LoginProviderOption } from '../../auth/providers'

const providerButtons = [
  { id: 'google', label: 'Continue with Google', Icon: FcGoogle },
  { id: 'apple', label: 'Continue with Apple', Icon: SiApple },
  { id: 'saml', label: 'Institutional SSO', Icon: HiOutlineBuildingOffice2 },
] as const

export interface LoginProps {
  onSignIn: (provider?: LoginProvider) => void | Promise<void>
  providers?: LoginProviderOption[]
  onPreview: () => void
  onSignOut?: () => void | Promise<void>
  busy?: boolean
  error?: string
  configured?: boolean
  authenticated?: boolean
  label?: string
  organizations?: ApiOrganization[]
}
export default function LogIn({ onSignIn, onPreview, onSignOut, providers = [], busy = false, error, configured = true, authenticated = false, label, organizations = [] }: LoginProps) {
  return <main className="login-page">
    <section className="login-brand" aria-label="About StudioStack">
      <div className="login-brand-top"><span className="login-kicker">The equipment workspace</span><span className="login-edition">01 / ACCESS</span></div>
      <div className="login-brand-center">
        <img src={logo.src ?? logo} className="login-wordmark" alt="StudioStack" />
        <p>Keep your gear, bookings<br />and people in one place.</p>
        <div className="login-orbit" aria-hidden="true"><div /><div /><div /><span>SS</span></div>
      </div>
      <div className="login-brand-bottom"><span>Built for teams.<br />Ready for the next production.</span><span className="login-brand-arrow" aria-hidden="true">↗</span></div>
    </section>
    <section className="login-access" aria-labelledby="login-title">
      <div className="login-access-top"><span>YOUR WORKSPACE, CONNECTED.</span><button type="button" onClick={onPreview} disabled={busy}>Explore preview <HiOutlineArrowUpRight aria-hidden="true" /></button></div>
      <div className="login-form-area">
        <span className="login-section-number">{authenticated ? 'ACCOUNT / 01' : 'SIGN IN / 01'}</span>
        <h1 id="login-title">{authenticated ? 'You’re signed in.' : 'Welcome back.'}</h1>
        <p className="login-description">{authenticated ? label : 'Sign in to access your organization’s workspace.'}</p>
        {authenticated ? <>
          <div className="login-connected"><HiOutlineCheckCircle aria-hidden="true" /><span>Account connected securely</span></div>
          <div className="login-memberships">
            <h2>{organizations.length ? 'Your organizations' : 'Workspace access pending'}</h2>
            {organizations.length ? <ul>{organizations.map(org => <li key={org.id}><span>{org.name}</span><small>{org.role}</small></li>)}</ul>
              : <p>Your account is ready. Ask an organization administrator to add your membership before accessing cloud data.</p>}
          </div>
          {organizations.length > 0 && <Link className="login-primary" href="/production/">Open Production <HiOutlineArrowRight aria-hidden="true" /></Link>}
          <p className="login-security-note">Production briefs use your organization’s live records. Other workspace pages remain in preview.</p>
          <button className="login-text-action" onClick={() => void onSignOut?.()}>Sign out of this account</button>
        </> : <>
          <div className="login-providers" role="group" aria-label="Sign-in options">
            {providerButtons.map(({ id, label: buttonLabel, Icon }) => {
              const connected = Boolean(providers.find(provider => provider.id === id)?.identityProvider)
              return <button key={id} type="button" className="login-provider" aria-label={buttonLabel}
                aria-describedby={!connected ? 'login-provider-status' : id === 'saml' ? 'login-saml-note' : undefined}
                disabled={busy || !configured || !connected} onClick={() => void onSignIn(id)}>
                <Icon className="login-provider-icon" aria-hidden="true" /><span>{buttonLabel}{id === 'saml' && <small>SAML · University or company</small>}</span>
                {connected ? <HiOutlineArrowRight className="login-provider-arrow" aria-hidden="true" /> : <small className="login-provider-pending">Coming soon</small>}
              </button>
            })}
          </div>
          <p id="login-provider-status" className="login-provider-status">Options marked “Coming soon” are awaiting their provider connection.</p>
          <p id="login-saml-note" className="login-sr-only">Sign in through your configured institution’s SAML provider. UF access requires UFIT approval.</p>
          <div className="login-divider"><span>or use your StudioStack account</span></div>
          <button type="button" className="login-primary" onClick={() => void onSignIn()} disabled={busy || !configured}>
            {busy ? <><span className="login-spinner" aria-hidden="true" />Connecting securely…</> : <>Continue to sign in <HiOutlineArrowRight aria-hidden="true" /></>}
          </button>
          {!configured && <p className="login-inline-note">Sign-in is not configured for this website address yet. You can still explore the preview.</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
          {busy && <p className="login-security-note" role="status">Connecting to secure sign-in. Please wait.</p>}
          <p className="login-password-note"><HiOutlineLockClosed aria-hidden="true" />Your password stays with the sign-in provider.</p>
          <details className="login-help"><summary>Need access?</summary><p>Ask your organization’s administrator for an account invitation. Public signup is not enabled.</p></details>
        </>}
      </div>
      <div className="login-access-bottom"><span>Private access. Shared possibilities.</span><Link href="/login/">StudioStack</Link></div>
    </section>
  </main>
}
