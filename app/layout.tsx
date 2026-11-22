// Every stylesheet loads here, once, in a fixed order. Route-level imports let the cascade change with the
// order routes were visited; importing them all in the root layout keeps it the same on every page.
import '../src/index.css'
import '../src/styles/tokens.css'
import '../src/App.css'
import '../src/styles/workspace.css'
import '../src/styles/calendar.css'
import '../src/views/Organization/Organization.css'
import '../src/styles/shell.css'
import '../src/styles/tour.css'
import '../src/components/workspace/ConfirmDialog.css'
import '../src/views/Accounts/Administration.css'
import '../src/views/Equipment/Equipment.css'
import '../src/views/Equipment/Reservations.css'
import '../src/views/Production/Production.css'
import '../src/views/Account/Account.css'
import '../src/views/Organization/OrganizationDirectory.css'
import '../src/views/Organization/OrganizationHeader.css'
import AppShell from '../src/components/AppShell'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

// The page draws under iOS notches and the home indicator; sticky bars pad themselves with env(safe-area-inset-*).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export const metadata: Metadata = {
  metadataBase: new URL('https://main.dxs0q7vrz4oko.amplifyapp.com'),
  // Each page names itself in a sibling layout.tsx so open browser tabs can be told apart.
  title: { default: 'Home | StudioStack', template: '%s | StudioStack' },
  description: 'Production equipment operations for The Agency at UF',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
  openGraph: { siteName: 'StudioStack', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body><AppShell>{children}</AppShell></body>
    </html>
  )
}
