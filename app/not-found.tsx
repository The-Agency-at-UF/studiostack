import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return <main className="administration workspace-surface">
    <header><div><h1>Page not found</h1><p>This address doesn’t match a StudioStack page. It may have moved, or the link may be incomplete.</p></div></header>
    <p><Link className="ws-button ws-button-primary" href="/">Go to Home</Link></p>
  </main>
}
