'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { OrganizationSettings } from '../../types/accounts'
import { useAppSession } from '../../context/AppSessionContext'
import { TabPill } from '../../components/workspace/TabPill'

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?'

/** One header and tab bar for every Organization page, so People and Settings read as one place. */
export default function OrganizationHeader({ settings, active, action }: { settings: OrganizationSettings | null; active: 'people' | 'settings'; action?: ReactNode }) {
  const manager = settings?.role === 'owner' || settings?.role === 'admin'
  const session = useAppSession()
  const selectedId = session.selectedOrganizationId ?? session.organizations?.[0]?.id
  const logoUrl = settings?.logoPhotoId ? session.organizations?.find(org => org.id === selectedId)?.logoUrl : null
  // An expired or missing logo falls back to the monogram instead of an empty box.
  const [logoFailed, setLogoFailed] = useState(false)
  useEffect(() => setLogoFailed(false), [logoUrl])
  return <>
    <header className="org-header">
      {logoUrl && !logoFailed ? <img className="org-header-monogram org-header-logo" src={logoUrl} alt="" onError={() => setLogoFailed(true)} /> : <span className="org-header-monogram" aria-hidden="true">{settings ? initials(settings.name) : ''}</span>}
      <div className="org-header-title">
        <h1>{settings?.name ?? 'Your organization'}</h1>
      </div>
      {action}
    </header>
    {manager && <nav className="org-header-tabs ws-pill-tabs" aria-label="Organization sections">
      <TabPill id="organization-sections" />
      <Link href="/organization" aria-current={active === 'people' ? 'page' : undefined}>People</Link>
      {active === 'settings'
        ? <a href="#general" aria-current="page">Access &amp; settings</a>
        : <Link href="/organization/settings">Access &amp; settings</Link>}
    </nav>}
  </>
}
