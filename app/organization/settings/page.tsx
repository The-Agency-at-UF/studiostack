'use client'

import Administration from '../../../src/views/Accounts/Administration'
import Organization from '../../../src/views/Organization/Organization'
import { useAppSession } from '../../../src/context/AppSessionContext'

export default function OrganizationSettingsPage() {
  const session = useAppSession()
  if (session.mode === 'authenticated') return <Administration />
  return <Organization isAdmin={session.isAdmin} initialTab="settings" />
}
