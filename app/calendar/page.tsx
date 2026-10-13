'use client'

import Calendar from '../../src/views/Calendar/Calendar'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function CalendarPage() {
  const { isAdmin } = useAppSession()
  return <Calendar isAdmin={isAdmin} />
}
