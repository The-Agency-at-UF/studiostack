'use client'

import type {ReactNode} from 'react'
import Link from 'next/link'
import { HiOutlineArrowRight, HiOutlineArrowUpRight, HiOutlineLockClosed, HiOutlineCheckCircle, HiOutlineBuildingOffice2 } from 'react-icons/hi2'
import { FcGoogle } from 'react-icons/fc'
import { SiApple } from 'react-icons/si'
import logo from '../../assets/StudioStack.png'
import type { ApiOrganization } from '../../types/database-api'
import type { LoginProvider, LoginProviderOption } from '../../auth/providers'
import { Select } from '../../components/workspace/WorkspaceUI'

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
  selectedOrganizationId?: string
  onSelectOrganization?: (id:string)=>void
  accountActions?:ReactNode
  accountSignIn?:ReactNode
  hideUnavailableProviders?:boolean
  accessSection?:string
  accessHeading?:string
  accessDescription?:string
}
export default function LogIn({ onSignIn, onPreview, onSignOut, providers = [], busy = false, error, configured = true, authenticated = false, label, organizations = [],selectedOrganizationId,onSelectOrganization,accountActions,accountSignIn,hideUnavailableProviders=false,accessSection,accessHeading,accessDescription }: LoginProps) {
  return <main className="login-page">
    <section className="login-brand" aria-label="About StudioStack">
      <div className="login-brand-top"><span className="login-kicker">The Agency at UF</span><span className="login-edition">Studio workspace</span></div>
      <div className="login-brand-center">
        <img src={logo.src ?? logo} className="login-wordmark" alt="StudioStack" />
        <p>Production, equipment,<br />and your team.</p>
        <div className="login-orbit" aria-hidden="true"><div /><div /><div /><span>SS</span></div>
      </div>
      <div className="login-brand-bottom"><span>Built for teams.<br />Ready for the next production.</span><span className="login-brand-arrow" aria-hidden="true">↗</span></div>
    </section>
    <section className="login-access" aria-labelledby="login-title">
      <div className="login-access-top"><span>YOUR WORKSPACE, CONNECTED.</span><button type="button" onClick={onPreview} disabled={busy}>Explore preview <HiOutlineArrowUpRight aria-hidden="true" /></button></div>
      <div className="login-form-area">
        <span className="login-section-number">{authenticated ? 'Your account' : accessSection?.replace(/ \/ 01$/, '')??'Sign in'}</span>
        <h1 id="login-title">{authenticated ? 'You’re signed in.' : accessHeading??'Welcome back.'}</h1>
        <p className="login-description">{authenticated ? label : accessDescription??'Sign in to access your organization’s workspace.'}</p>
        {authenticated ? <>
          <div className="login-connected"><HiOutlineCheckCircle aria-hidden="true" /><span>Account connected securely</span></div>
          {organizations.length>0&&<div className="login-memberships">
            <h2>Your workspaces</h2>
            <label className="login-workspace-picker">Your workspace<Select value={organizations.some(org=>org.id===selectedOrganizationId)?selectedOrganizationId:organizations[0].id} onChange={event=>onSelectOrganization?.(event.target.value)}>{organizations.map(org=><option key={org.id} value={org.id}>{org.name} · {org.role}</option>)}</Select></label>
          </div>}
          {accountActions}
          {organizations.length > 0 && <Link className="login-primary" href="/production/">Open Production <HiOutlineArrowRight aria-hidden="true" /></Link>}
          <p className="login-security-note">Your organization’s account, production and inventory records are live.</p>
          <button className="login-text-action" onClick={() => void onSignOut?.()}>Sign out of this account</button>
        </> : <>
          {(!hideUnavailableProviders||providers.some(p=>p.identityProvider))&&<>
          <div className="login-providers" role="group" aria-label="Sign-in options">
            {providerButtons.filter(p=>!hideUnavailableProviders||providers.some(option=>option.id===p.id&&option.identityProvider)).map(({ id, label: buttonLabel, Icon }) => {
              const connected = Boolean(providers.find(provider => provider.id === id)?.identityProvider)
              return <button key={id} type="button" className="login-provider" aria-label={buttonLabel}
                aria-describedby={!connected ? 'login-provider-status' : id === 'saml' ? 'login-saml-note' : undefined}
                disabled={busy || !configured || !connected} onClick={() => void onSignIn(id)}>
                <Icon className="login-provider-icon" aria-hidden="true" /><span>{buttonLabel}{id === 'saml' && <small>SAML · University or company</small>}</span>
                {connected ? <HiOutlineArrowRight className="login-provider-arrow" aria-hidden="true" /> : <small className="login-provider-pending">Coming soon</small>}
              </button>
            })}
          </div>
          {!hideUnavailableProviders&&<p id="login-provider-status" className="login-provider-status">Options marked “Coming soon” are awaiting their provider connection.</p>}
          <p id="login-saml-note" className="login-sr-only">Sign in through your configured institution’s SAML provider. UF access requires UFIT approval.</p>
          <div className="login-divider"><span>or use your StudioStack account</span></div>
          </>}
          {accountSignIn&&error&&<p className="login-error" role="alert">{error}</p>}
          {accountSignIn??<><button type="button" className="login-primary" onClick={() => void onSignIn()} disabled={busy || !configured}>
            {busy ? <><span className="login-spinner" aria-hidden="true" />Connecting securely…</> : <>Continue to sign in <HiOutlineArrowRight aria-hidden="true" /></>}
          </button>
          {!configured && <p className="login-inline-note">Sign-in is not configured for this website address yet. You can still explore the preview.</p>}
          {error && <p className="login-error" role="alert">{error}</p>}
          {busy && <p className="login-security-note" role="status">Connecting to secure sign-in. Please wait.</p>}
          <p className="login-password-note"><HiOutlineLockClosed aria-hidden="true" />Your password stays with the sign-in provider.</p></>}
        </>}
      </div>
      <div className="login-access-bottom"><span>Private access. Shared possibilities.</span><Link href="/login/">StudioStack</Link></div>
    </section>
  </main>
}
