'use client'

import Users from '../../src/views/Users/Users'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function UsersPage() {
  const { isAdmin } = useAppSession()
  return <Users isAdmin={isAdmin} />
}
