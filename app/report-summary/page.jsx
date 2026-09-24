'use client'

import { Suspense } from 'react'
import ReportSummary from '../../src/views/Report/ReportSummary'
import { useAppSession } from '../../src/context/AppSessionContext'

function ReportSummaryContent() {
  const { email, isAdmin } = useAppSession()
  return <ReportSummary isAdmin={isAdmin} userEmail={email} />
}

export default function ReportSummaryPage() {
  return <Suspense><ReportSummaryContent /></Suspense>
}
