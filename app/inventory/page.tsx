'use client'

import LiveInventory from '../../src/views/Equipment/Inventory'
import Inventory from '../../src/views/Inventory/Inventory'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function InventoryPage() {
  const { isAdmin, mode } = useAppSession()
  if(mode==='authenticated')return <LiveInventory/>
  return <Inventory isAdmin={isAdmin} />
}
