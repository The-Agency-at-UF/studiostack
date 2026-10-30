'use client'
import dynamic from 'next/dynamic'
const Calendar = dynamic(() => import('../../src/views/Equipment/Calendar'), {
  ssr: false,
  loading: () => <main className="administration"><h1>Equipment calendar</h1><p role="status">Loading equipment calendar…</p></main>,
})
export default function CalendarPage(){return <Calendar/>}
