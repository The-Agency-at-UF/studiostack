'use client'

import Administration from '../../src/views/Accounts/Administration'
import Users from '../../src/views/Users/Users'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function UsersPage() {
  const session=useAppSession()
  const {isAdmin}=session
  if(session.mode==='authenticated')return <Administration section='people' />
  return <Users isAdmin={isAdmin} />
}
