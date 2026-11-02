'use client'
import dynamic from 'next/dynamic'
import { Skeleton } from '../../src/components/workspace/WorkspaceUI'
const Calendar = dynamic(() => import('../../src/views/Equipment/Calendar'), {
  ssr: false,
  loading: () => <main className="administration"><h1>Equipment calendar</h1><Skeleton label="Loading equipment calendar…" /></main>,
})
export default function CalendarPage(){return <Calendar/>}
