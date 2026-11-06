import 'reactjs-popup/dist/index.css'
import '../src/index.css'
import '../src/App.css'
import '../src/styles/tokens.css'
import '../src/styles/workspace.css'
import '../src/views/Organization/Organization.css'
import AppShell from '../src/components/AppShell'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  metadataBase: new URL('https://main.dxs0q7vrz4oko.amplifyapp.com'),
  title: 'StudioStack',
  description: 'Production equipment operations for The Agency at UF',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
  openGraph: { siteName: 'StudioStack', type: 'website' },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><AppShell>{children}</AppShell></body>
    </html>
  )
}
