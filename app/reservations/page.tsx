'use client'

import Reservations from '../../src/views/Reservation/Reservations'
import LiveReservations from '../../src/views/Equipment/Reservations'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function ReservationsPage() {
  const session=useAppSession()
  if(session.mode==='authenticated')return <LiveReservations/>
  const { isAdmin } = session
  return <Reservations isAdmin={isAdmin} />
}
