'use client'

import Administration from '../../src/views/Accounts/Administration'
import Teams from '../../src/views/Teams/Teams'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function TeamsPage() {
  const session=useAppSession()
  const {isAdmin}=session
  if(session.mode==='authenticated')return <Administration section='teams' />
  return <Teams isAdmin={isAdmin} />
}
