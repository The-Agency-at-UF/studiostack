'use client'

import Inventory from '../../src/views/Inventory/Inventory'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function InventoryPage() {
  const { isAdmin, getAccessToken, mode } = useAppSession()
  // The preview store/legacy uploader must not activate against the new API
  // merely because a real session exists. Scoped inventory wiring is separate.
  return <Inventory isAdmin={isAdmin} getAccessToken={mode === 'authenticated' ? undefined : getAccessToken} />
}
