'use client'

import Teams from '../../src/views/Teams/Teams'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function TeamsPage() {
  const { isAdmin } = useAppSession()
  return <Teams isAdmin={isAdmin} />
}
