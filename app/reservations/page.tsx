'use client'

import Reservations from '../../src/views/Reservation/Reservations'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function ReservationsPage() {
  const { isAdmin } = useAppSession()
  return <Reservations isAdmin={isAdmin} />
}
