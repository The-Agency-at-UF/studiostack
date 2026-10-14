'use client'

import dynamic from 'next/dynamic'

const Statistics = dynamic(
  () => import('../../src/views/Statistics/Statistics'),
  { ssr: false },
)

export default function StatisticsPage() {
  return <Statistics />
}
