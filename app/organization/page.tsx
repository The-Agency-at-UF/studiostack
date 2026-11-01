'use client'

import Organization from '../../src/views/Organization/Organization'
import OrganizationDirectory from '../../src/views/Organization/OrganizationDirectory'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function OrganizationPage() {
  const session=useAppSession()
  const {isAdmin}=session
  if(session.mode==='authenticated')return <OrganizationDirectory />
  return <Organization isAdmin={isAdmin} />
}
