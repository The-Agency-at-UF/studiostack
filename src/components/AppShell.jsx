'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { getAuth, signOut } from 'firebase/auth'
import Header from './Header'
import { AppSessionProvider } from '../context/AppSessionContext'

const INACTIVITY_TIMEOUT = 60 * 60 * 1000
const BugReportPopup = dynamic(() => import('./BugReportPopup'), { ssr: false })

export default function AppShell({ children }) {
  const [email, setEmail] = useState('demo@studiostack.com')
  const [isAdmin, setIsAdmin] = useState(true)

  useEffect(() => {
    setEmail(localStorage.getItem('email') || 'demo@studiostack.com')
    setIsAdmin(localStorage.getItem('isAdmin') !== 'false')
  }, [])

  const logOut = useCallback(async () => {
    try {
      await signOut(getAuth())
    } catch (error) {
      console.error('Error signing out: ', error)
    } finally {
      localStorage.removeItem('email')
      localStorage.removeItem('isAdmin')
      window.location.assign('/')
    }
  }, [])

  useEffect(() => {
    let inactivityTimer
    const resetTimer = () => {
      window.clearTimeout(inactivityTimer)
      inactivityTimer = window.setTimeout(() => {
        if (localStorage.getItem('email')) logOut()
      }, INACTIVITY_TIMEOUT)
    }

    const activityEvents = ['mousemove', 'keydown', 'click']
    activityEvents.forEach((event) => window.addEventListener(event, resetTimer))
    resetTimer()

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, resetTimer))
      window.clearTimeout(inactivityTimer)
    }
  }, [logOut])

  const session = useMemo(
    () => ({ email, isAdmin, setEmail, setIsAdmin }),
    [email, isAdmin],
  )

  return (
    <AppSessionProvider value={session}>
      <Header isAdmin={isAdmin} logOut={logOut} />
      <div className="app-content">{children}</div>
      <footer className="sticky-footer">
        <span className="footer-status"><i /> Studio operations online</span>
        <BugReportPopup userEmail={email} />
      </footer>
    </AppSessionProvider>
  )
}
