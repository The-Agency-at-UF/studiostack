'use client'

import Dashboard from '../src/views/Dashboard/Dashboard'
import { useAppSession } from '../src/context/AppSessionContext'

export default function HomePage() {
  const { isAdmin } = useAppSession()
  return <Dashboard isAdmin={isAdmin} />
}
