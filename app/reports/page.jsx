'use client'

import Reports from '../../src/views/Report/Reports'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function ReportsPage() {
  const { isAdmin } = useAppSession()
  return <Reports isAdmin={isAdmin} />
}
