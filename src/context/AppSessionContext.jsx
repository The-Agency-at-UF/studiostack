'use client'

import { createContext, useContext } from 'react'

const AppSessionContext = createContext(null)

export function AppSessionProvider({ children, value }) {
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
