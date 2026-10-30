'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import Header from './Header'
import { AppSessionProvider } from '../context/AppSessionContext'
import { accessToken, authConfiguration, clearSignIn, forgetVerifiedSession, AuthenticationUnavailable, enterPreview, finishSignIn, hasCallback, isPreview, logoutUrl, signInUrl } from '../auth/cognito'
import {restorePasswordSession,signOutPasswordSession} from '../auth/password'
import { createDatabaseApiClient, DatabaseApiClientError } from '../api/database'
import { invalidateCache } from '../api/cache'
import type { ApiOrganization } from '../types/database-api'
import type {SignedInUser} from '../auth/cognito'
import type { LoginProvider } from '../auth/providers'

type Mode = 'signed-out' | 'authenticated' | 'preview'
type Boot = { mode: Mode; label: string; admin: boolean; organizations: ApiOrganization[]; expiresAt?: number; subject?:string }
async function loadAccount(user:SignedInUser):Promise<Boot>{
  const api=createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:accessToken})
  try{await api.me()}catch(error){if(!(error instanceof DatabaseApiClientError)||error.status!==404)throw error;await api.register(user.label.slice(0,120))}
  const result=await api.organizations({limit:100})
  return {mode:'authenticated',label:user.label,admin:['owner','admin'].includes(result.items[0]?.role),organizations:result.items,expiresAt:user.expiresAt,subject:user.subject}
}
function takeReturnPath(){const value=sessionStorage.getItem('studiostack.return');sessionStorage.removeItem('studiostack.return');if(!value||value.length>2048)return null;try{const url=new URL(value,window.location.origin);return url.origin===window.location.origin&&!url.pathname.startsWith('//')&&url.pathname!=='/login/'&&url.pathname!=='/login'?url.pathname+url.search+url.hash:null}catch{return null}}
const BugReportPopup = dynamic(() => import('./BugReportPopup'), { ssr: false })

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname()
  const loginPage = pathname === '/login' || pathname === '/login/'
  const loginPageRef = useRef(loginPage)
  loginPageRef.current = loginPage
  const [mode, setMode] = useState<Mode>('signed-out')
  const [email, setEmail] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [organizations, setOrganizations] = useState<ApiOrganization[]>([])
  const [selectedOrganizationId,setSelectedOrganizationId]=useState(''), [subject,setSubject]=useState('')
  const chooseOrganization=useCallback((id:string)=>{setSelectedOrganizationId(id);if(subject&&organizations.some(o=>o.id===id))try{localStorage.setItem('studiostack.organization.'+subject,id)}catch{/* Storage unavailable */}},[subject,organizations])
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false)
  const [authError, setAuthError] = useState(''), [configured, setConfigured] = useState(true)
  const [expiresAt, setExpiresAt] = useState<number>(),[refreshRetry,setRefreshRetry]=useState(0)
  const boot = useRef<Promise<Boot> | null>(null)
  const bootedByUser = useRef(false)

  useEffect(() => {
    let active = true
    try { authConfiguration() } catch { setConfigured(false) }
    if (!boot.current) {
      invalidateCache()
      const url = window.location.href
      if (hasCallback(url)) {
        window.history.replaceState(null, '', '/login/')
        setBusy(true)
      }
      boot.current = (async (): Promise<Boot> => {
        // Legacy local flags never establish an authenticated role.
        localStorage.removeItem('email'); localStorage.removeItem('isAdmin')
        if (hasCallback(url)) {
          return loadAccount(await finishSignIn(authConfiguration(),url))
        }
        if (!isPreview()) { const user=await restorePasswordSession();if(user)return loadAccount(user) }
        return { mode: isPreview() ? 'preview' : 'signed-out', label: isPreview() ? 'demo@studiostack.com' : '', admin: isPreview(), organizations: [] }
      })()
    }
    boot.current.then(result => {
      if (!active || bootedByUser.current) return
      if (result.mode === 'authenticated' || result.mode === 'preview') {
        try {
          localStorage.setItem('email', result.label)
          localStorage.setItem('isAdmin', String(result.admin))
        } catch { /* storage access error */ }
      }
      if (result.mode === 'authenticated' && loginPageRef.current) {
        const destination = sessionStorage.getItem('studiostack-production-return')
        sessionStorage.removeItem('studiostack-production-return')
        const target=destination&&/^\/production\/\?organization=[a-f0-9-]{36}&brief=[a-f0-9-]{36}$/.test(destination)?destination:takeReturnPath();if(target)router.replace(target)
      }
      if(result.subject){setSubject(result.subject);const saved=localStorage.getItem('studiostack.organization.'+result.subject);if(saved&&result.organizations.some(o=>o.id===saved))setSelectedOrganizationId(saved)}
      setMode(result.mode); setEmail(result.label); setIsAdmin(result.admin); setOrganizations(result.organizations); setExpiresAt(result.expiresAt)
    }).catch((error:unknown) => {
      if (!active || bootedByUser.current) return
      const transient=error instanceof AuthenticationUnavailable||error instanceof TypeError||['NetworkError','TimeoutError'].includes((error as {name?:string})?.name??'')||(error instanceof DatabaseApiClientError&&[429,500,502,503,504].includes(error.status))
      if(transient)forgetVerifiedSession();else clearSignIn();setMode('signed-out'); setIsAdmin(false)
      try {
        localStorage.removeItem('email'); localStorage.removeItem('isAdmin')
      } catch { /* storage access error */ }
      setAuthError(transient?'Could not connect to StudioStack. Refresh the page to retry.':'Sign-in could not be completed. Try again, or ask your administrator to check your account access.')
    }).finally(() => { if (active) { setReady(true); setBusy(false) } })
    return () => { active = false }
  }, [router])

  useEffect(() => {
    if (ready && mode === 'signed-out' && !loginPage) {
      sessionStorage.setItem('studiostack.return',window.location.pathname+window.location.search+window.location.hash)
      if (pathname.replace(/\/$/,'') === '/production') {
        const p = new URLSearchParams(window.location.search), org = p.get('organization'), brief = p.get('brief')
        if (org && brief && /^[a-f0-9-]{36}$/.test(org) && /^[a-f0-9-]{36}$/.test(brief)) sessionStorage.setItem('studiostack-production-return', `/production/?organization=${org}&brief=${brief}`)
      }
      router.replace('/login/')
    }
  }, [ready, mode, loginPage, router, pathname])

  const logOut = useCallback(async () => {
    invalidateCache()
    bootedByUser.current = false
    const real = mode === 'authenticated'
    if(real)try{await signOutPasswordSession()}catch{/* Clear local session even if revocation fails. */}
    clearSignIn()
    try {
      localStorage.removeItem('email'); localStorage.removeItem('isAdmin')
    } catch { /* storage access error */ }
    setMode('signed-out'); setEmail(''); setIsAdmin(false); setOrganizations([]); setExpiresAt(undefined);setSubject('');setSelectedOrganizationId('')
    if (real) {
      try { window.location.assign(logoutUrl()); return } catch { /* Remain signed out if hosting config is unavailable. */ }
    }
    router.replace('/login/')
  }, [mode, router])

  useEffect(() => {
    if (mode !== 'authenticated' || !expiresAt) return
    const timer = window.setTimeout(() => {
      void restorePasswordSession(authConfiguration(),true).then(user=>{
        if(user){setRefreshRetry(0);setExpiresAt(user.expiresAt)}
        else {clearSignIn();setMode('signed-out');setOrganizations([]);router.replace('/login/')}
      }).catch(()=>{setAuthError('Could not refresh your session. Check your connection.');setRefreshRetry(n=>n+1)})
    }, refreshRetry?30_000:Math.max(0, expiresAt - Date.now() - 30_000))
    return () => window.clearTimeout(timer)
  }, [mode, expiresAt, router, refreshRetry])

  const signIn = useCallback(async (provider?: LoginProvider) => {
    setBusy(true); setAuthError('')
    try { window.location.assign(await signInUrl(authConfiguration(), provider)) }
    catch { setAuthError('Sign-in is unavailable at this address. Use localhost:5174 or ask your administrator to configure this website.'); setBusy(false) }
  }, [])
  const openPreview = useCallback(async () => {
    invalidateCache()
    bootedByUser.current = true
    const real = mode === 'authenticated'
    if(real)try{await signOutPasswordSession()}catch{/* Clear local session even if revocation fails. */}
    enterPreview(); setMode('preview'); setEmail('demo@studiostack.com'); setIsAdmin(true); setOrganizations([]); setExpiresAt(undefined);setSubject('');setSelectedOrganizationId(''); setAuthError(''); setReady(true)
    try {
      localStorage.setItem('email', 'demo@studiostack.com')
      localStorage.setItem('isAdmin', 'true')
    } catch { /* storage access error */ }
    if (real) { try { window.location.assign(logoutUrl()); return } catch { /* Preview never receives credentials. */ } }
    router.push('/')
  }, [mode, router])
  const completeSignIn=useCallback(async(user:SignedInUser)=>{
    invalidateCache()
    bootedByUser.current = true
    setBusy(true);setAuthError('')
    try{const result=await loadAccount(user);setSubject(user.subject);const saved=localStorage.getItem('studiostack.organization.'+user.subject);setSelectedOrganizationId(saved&&result.organizations.some(o=>o.id===saved)?saved:'');setMode(result.mode);setEmail(result.label);setIsAdmin(result.admin);setOrganizations(result.organizations);setExpiresAt(result.expiresAt);setReady(true)
      try {
        localStorage.setItem('email', result.label)
        localStorage.setItem('isAdmin', String(result.admin))
      } catch { /* storage access error */ }
      const destination=sessionStorage.getItem('studiostack-production-return');sessionStorage.removeItem('studiostack-production-return');const target=destination&&/^\/production\/\?organization=[a-f0-9-]{36}&brief=[a-f0-9-]{36}$/.test(destination)?destination:takeReturnPath();router.replace(target || '/')
    }catch{bootedByUser.current=false;clearSignIn();setMode('signed-out');setAuthError('Your account could not be loaded. Try signing in again.');throw new Error('Account unavailable')}finally{setBusy(false)}
  },[router])
  const refreshOrganizations=useCallback(async()=>{const result=await createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:accessToken}).organizations({limit:100});setOrganizations(result.items)},[])
  const selectedOrganization=organizations.find(org=>org.id===selectedOrganizationId)??organizations[0]
  const currentAdmin=mode==='authenticated'?['owner','admin'].includes(selectedOrganization?.role):isAdmin
  const session = useMemo(() => ({ email, isAdmin:currentAdmin, setEmail, setIsAdmin, mode, signIn, openPreview, signOut: logOut, busy, authError, configured, organizations,completeSignIn,setAuthenticating:setBusy,selectedOrganizationId:selectedOrganization?.id,setSelectedOrganizationId:chooseOrganization,refreshOrganizations,
    ...(mode === 'authenticated' ? { getAccessToken: accessToken } : {}) }), [email, mode, signIn, openPreview, logOut, busy, authError, configured, organizations,currentAdmin,selectedOrganization?.id,refreshOrganizations,completeSignIn,chooseOrganization])

  return <AppSessionProvider value={session}>
    {busy ? <main className="session-loading" aria-live="polite"><span className="login-spinner" aria-hidden="true" />Completing secure sign-in…</main>
      : loginPage ? children
      : mode === 'signed-out' ? <main className="session-loading" aria-live="polite"><span className="login-spinner" aria-hidden="true" />Opening StudioStack…</main>
      : <>
        <Header isAdmin={currentAdmin} logOut={logOut} email={email} />
        <div className="app-content" id="workspace-content" tabIndex={-1}>{children}</div>
        <footer className="sticky-footer"><span className="footer-status">StudioStack workspace</span><BugReportPopup userEmail={email} /></footer>
      </>}
  </AppSessionProvider>
}
