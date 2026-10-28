'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import Header from './Header'
import { AppSessionProvider } from '../context/AppSessionContext'
import { accessToken, authConfiguration, clearSignIn, enterPreview, finishSignIn, hasCallback, isPreview, logoutUrl, signInUrl } from '../auth/cognito'
import { createDatabaseApiClient } from '../api/database'
import type { ApiOrganization } from '../types/database-api'
import type { LoginProvider } from '../auth/providers'

type Mode = 'signed-out' | 'authenticated' | 'preview'
type Boot = { mode: Mode; label: string; admin: boolean; organizations: ApiOrganization[]; expiresAt?: number }
const BugReportPopup = dynamic(() => import('./BugReportPopup'), { ssr: false })

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname()
  const loginPage = pathname === '/login' || pathname === '/login/'
  const [mode, setMode] = useState<Mode>('signed-out')
  const [email, setEmail] = useState(''), [isAdmin, setIsAdmin] = useState(false)
  const [organizations, setOrganizations] = useState<ApiOrganization[]>([])
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false)
  const [authError, setAuthError] = useState(''), [configured, setConfigured] = useState(true)
  const [expiresAt, setExpiresAt] = useState<number>()
  const boot = useRef<Promise<Boot> | null>(null)

  useEffect(() => {
    let active = true
    try { authConfiguration() } catch { setConfigured(false) }
    if (!boot.current) {
      const url = window.location.href
      if (hasCallback(url)) {
        window.history.replaceState(null, '', '/login/')
        setBusy(true)
      }
      boot.current = (async (): Promise<Boot> => {
        // Legacy local flags never establish an authenticated role.
        localStorage.removeItem('email'); localStorage.removeItem('isAdmin')
        if (hasCallback(url)) {
          const config = authConfiguration(), user = await finishSignIn(config, url)
          const api = createDatabaseApiClient({ baseUrl: config.apiUrl, getAccessToken: accessToken })
          await api.register(user.label.slice(0, 120))
          const result = await api.organizations({ limit: 100 })
          return { mode: 'authenticated', label: user.label, admin: ['owner', 'admin'].includes(result.items[0]?.role), organizations: result.items, expiresAt: user.expiresAt }
        }
        return { mode: isPreview() ? 'preview' : 'signed-out', label: isPreview() ? 'demo@studiostack.com' : '', admin: isPreview(), organizations: [] }
      })()
    }
    boot.current.then(result => {
      if (!active) return
      if (result.mode === 'authenticated') {
        const destination = sessionStorage.getItem('studiostack-production-return')
        sessionStorage.removeItem('studiostack-production-return')
        if (destination && /^\/production\/\?organization=[a-f0-9-]{36}&brief=[a-f0-9-]{36}$/.test(destination)) router.replace(destination)
      }
      setMode(result.mode); setEmail(result.label); setIsAdmin(result.admin); setOrganizations(result.organizations); setExpiresAt(result.expiresAt)
    }).catch(() => {
      if (!active) return
      clearSignIn(); setMode('signed-out'); setIsAdmin(false)
      setAuthError('Sign-in could not be completed. Try again, or ask your administrator to check your account access.')
    }).finally(() => { if (active) { setReady(true); setBusy(false) } })
    return () => { active = false }
  }, [router])

  useEffect(() => {
    if (ready && mode === 'signed-out' && !loginPage) {
      if (pathname.replace(/\/$/,'') === '/production') {
        const p = new URLSearchParams(window.location.search), org = p.get('organization'), brief = p.get('brief')
        if (org && brief && /^[a-f0-9-]{36}$/.test(org) && /^[a-f0-9-]{36}$/.test(brief)) sessionStorage.setItem('studiostack-production-return', `/production/?organization=${org}&brief=${brief}`)
      }
      router.replace('/login/')
    }
  }, [ready, mode, loginPage, router, pathname])

  const logOut = useCallback(async () => {
    const real = mode === 'authenticated'
    clearSignIn(); localStorage.removeItem('email'); localStorage.removeItem('isAdmin')
    setMode('signed-out'); setEmail(''); setIsAdmin(false); setOrganizations([]); setExpiresAt(undefined)
    if (real) {
      try { window.location.assign(logoutUrl()); return } catch { /* Remain signed out if hosting config is unavailable. */ }
    }
    router.replace('/login/')
  }, [mode, router])

  useEffect(() => {
    if (mode !== 'authenticated' || !expiresAt) return
    const timer = window.setTimeout(() => {
      clearSignIn(); setMode('signed-out'); setEmail(''); setIsAdmin(false); setOrganizations([])
      setAuthError('Your session expired. Sign in again.'); router.replace('/login/')
    }, Math.max(0, expiresAt - Date.now() - 10_000))
    return () => window.clearTimeout(timer)
  }, [mode, expiresAt, router])

  const signIn = useCallback(async (provider?: LoginProvider) => {
    setBusy(true); setAuthError('')
    try { window.location.assign(await signInUrl(authConfiguration(), provider)) }
    catch { setAuthError('Sign-in is unavailable at this address. Use localhost:5174 or ask your administrator to configure this website.'); setBusy(false) }
  }, [])
  const openPreview = useCallback(() => {
    const real = mode === 'authenticated'
    enterPreview(); setMode('preview'); setEmail('demo@studiostack.com'); setIsAdmin(true); setOrganizations([]); setExpiresAt(undefined); setAuthError('')
    if (real) { try { window.location.assign(logoutUrl()); return } catch { /* Preview never receives credentials. */ } }
    router.push('/')
  }, [mode, router])
  const session = useMemo(() => ({ email, isAdmin, setEmail, setIsAdmin, mode, signIn, openPreview, signOut: logOut, busy, authError, configured, organizations,
    ...(mode === 'authenticated' ? { getAccessToken: accessToken } : {}) }), [email, isAdmin, mode, signIn, openPreview, logOut, busy, authError, configured, organizations])

  return <AppSessionProvider value={session}>
    {!ready || (mode === 'signed-out' && !loginPage) ? <main className="session-loading" aria-live="polite"><span className="login-spinner" aria-hidden="true" />{busy ? 'Completing secure sign-in…' : 'Opening StudioStack…'}</main>
      : loginPage ? children : <>
        <Header isAdmin={isAdmin} logOut={logOut} email={email} />
        <aside className="session-banner"><span>{mode === 'authenticated' ? 'Signed in. Production uses your organization’s cloud data. Other workspace pages remain in preview.' : 'Preview mode — no real account or cloud data.'}</span>
          <Link href="/login/">{mode === 'authenticated' ? 'Your account' : 'Sign in'}</Link></aside>
        <div className="app-content">{children}</div>
        <footer className="sticky-footer"><span className="footer-status">StudioStack workspace</span><BugReportPopup userEmail={email} /></footer>
      </>}
  </AppSessionProvider>
}
