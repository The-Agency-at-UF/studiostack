'use client'

import { createContext, useContext } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { ApiOrganization } from '../types/database-api'
import type { LoginProvider } from '../auth/providers'

export interface AppSession {
  email: string
  isAdmin: boolean
  /** Provided only by a real authenticated session; never infer from demo email/isAdmin. */
  getAccessToken?: () => Promise<string>
  setEmail: Dispatch<SetStateAction<string>>
  setIsAdmin: Dispatch<SetStateAction<boolean>>
  mode?: 'signed-out' | 'authenticated' | 'preview'
  signIn?: (provider?: LoginProvider) => Promise<void>
  openPreview?: () => void
  signOut?: () => void | Promise<void>
  busy?: boolean
  authError?: string
  configured?: boolean
  organizations?: ApiOrganization[]
}
const AppSessionContext = createContext<AppSession | null>(null)

export function AppSessionProvider({ children, value }: { children: ReactNode; value: AppSession }) {
  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  )
}

export function useAppSession() {
  const session = useContext(AppSessionContext)
  if (!session) throw new Error('useAppSession must be used inside AppSessionProvider')
  return session
}
