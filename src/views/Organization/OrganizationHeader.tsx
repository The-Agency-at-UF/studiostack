'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { OrganizationSettings } from '../../types/accounts'
import './OrganizationHeader.css'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?'

/** One header and tab bar for every Organization page, so People and Settings read as one place. */
export default function OrganizationHeader({ settings, summary, active, action }: { settings: OrganizationSettings | null; summary?: ReactNode; active: 'people' | 'settings'; action?: ReactNode }) {
  const manager = settings?.role === 'owner' || settings?.role === 'admin'
  return <>
    <header className="org-header">
      <span className="org-header-monogram" aria-hidden="true">{settings ? initials(settings.name) : ''}</span>
      <div className="org-header-title">
        <p className="org-header-eyebrow">Organization</p>
        <h1>{settings?.name ?? 'Your organization'}</h1>
        {settings && <p>{summary ?? <>You&apos;re {settings.role === 'member' ? 'a member' : `an ${settings.role}`}</>}</p>}
      </div>
      {action}
    </header>
    {manager && <nav className="org-header-tabs" aria-label="Organization sections">
      <Link href="/organization" aria-current={active === 'people' ? 'page' : undefined}>People</Link>
      <Link href="/organization/settings" aria-current={active === 'settings' ? 'page' : undefined}>Access &amp; settings</Link>
    </nav>}
  </>
}
