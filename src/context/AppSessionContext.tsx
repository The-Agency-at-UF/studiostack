'use client'

import { createContext, useContext } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'

export interface AppSession {
  email: string
  isAdmin: boolean
  setEmail: Dispatch<SetStateAction<string>>
  setIsAdmin: Dispatch<SetStateAction<boolean>>
}
const AppSessionContext = createContext<AppSession | null>(null)
export function AppSessionProvider({ children, value }: { children: ReactNode; value: AppSession }) {
  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>
}
export function useAppSession() {
  const session = useContext(AppSessionContext)
  if (!session) throw new Error('useAppSession must be used inside AppSessionProvider')
  return session
}
