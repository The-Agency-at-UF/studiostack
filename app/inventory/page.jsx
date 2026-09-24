'use client'

import Inventory from '../../src/views/Inventory/Inventory'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function InventoryPage() {
  const { isAdmin } = useAppSession()
  return <Inventory isAdmin={isAdmin} />
}
