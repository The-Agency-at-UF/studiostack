'use client'

import Report from '../../src/views/Report/Report'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function CreateReportPage() {
  const { email } = useAppSession()
  return <Report userEmail={email} />
}
