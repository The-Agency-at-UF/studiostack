import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const title = 'Sign in to StudioStack'
const description = 'Production, equipment, and your team.'

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description, url: '/login/', siteName: 'StudioStack', type: 'website' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children
}
