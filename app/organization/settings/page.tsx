'use client'

import Organization from '../../../src/views/Organization/Organization'
import { useAppSession } from '../../../src/context/AppSessionContext'

export default function OrganizationSettingsPage() {
  const { isAdmin } = useAppSession()
  return <Organization isAdmin={isAdmin} initialTab="settings" />
}
