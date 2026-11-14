'use client'
import dynamic from 'next/dynamic'
// While the calendar code downloads, only announce loading: a visible stand-in page would enter, then be
// replaced by the real page entering again.
const Calendar = dynamic(() => import('../../src/views/Equipment/Calendar'), {
  ssr: false,
  loading: () => <p className="ws-sr-only" role="status">Loading equipment calendar…</p>,
})
export default function CalendarPage(){return <Calendar/>}
