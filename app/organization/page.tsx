'use client'

import Administration from '../../src/views/Accounts/Administration'
import Organization from '../../src/views/Organization/Organization'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function OrganizationPage() {
  const session=useAppSession()
  const {isAdmin}=session
  if(session.mode==='authenticated')return <Administration section='settings' />
  return <Organization isAdmin={isAdmin} />
}
