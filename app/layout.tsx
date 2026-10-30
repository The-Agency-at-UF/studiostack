import 'reactjs-popup/dist/index.css'
import '../src/index.css'
import '../src/App.css'
import '../src/styles/tokens.css'
import '../src/views/Calendar/Calendar.css'
import '../src/views/Calendar/MiniCalendar.css'
import '../src/views/Organization/Organization.css'
import AppShell from '../src/components/AppShell'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'StudioStack',
  description: 'Production equipment operations for The Agency at UF',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  )
}
