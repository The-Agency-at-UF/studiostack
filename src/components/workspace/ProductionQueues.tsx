'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAppSession } from '../../context/AppSessionContext'
import { createDatabaseApiClient } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import { createPreviewProductionClient } from '../../production/preview'
import { allPages, equipmentError } from '../../views/Equipment/live'
import { getCached, setCached } from '../../api/cache'
import { statusLabels, type ProductionAccess, type ProductionBrief } from '../../types/production'
import type { ProductionClient } from '../../api/production'
import { Button, EmptyState, Notice, QueueSection, Skeleton, StatusLabel } from './WorkspaceUI'

type Snapshot = { briefs: ProductionBrief[]; access: ProductionAccess }
function briefNeedsAttention(brief: ProductionBrief, access: ProductionAccess) {
  return (brief.ownerId === access.userId && ['draft', 'changes_requested'].includes(brief.status)) || ((access.canReview || access.isExecutive || access.canAdminister) && brief.status === 'submitted')
}
const dateLabel = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function ProductionQueues() {
  const session = useAppSession()
  const organization = session.organizations?.find(o => o.id === session.selectedOrganizationId) ?? session.organizations?.[0]
  const org = session.mode === 'preview' ? 'preview' : organization?.id
  const client = useMemo(() => {
    if (session.mode === 'preview') return createPreviewProductionClient('preview-author')
    if (!org || session.mode !== 'authenticated' || !session.getAccessToken) return null
    return createDatabaseApiClient({ baseUrl: authConfiguration().apiUrl, getAccessToken: session.getAccessToken }).production(org)
  }, [org, session.mode, session.getAccessToken])
  if (!client || !org) return null
  return <ProductionQueueWorkspace key={`${org}:${session.email}`} client={client} org={org} identity={session.email} preview={session.mode === 'preview'} />
}

function ProductionQueueWorkspace({ client, org, identity, preview }: { client: ProductionClient; org: string; identity: string; preview: boolean }) {
  const cacheKey = `production:${org}:home:${identity}`
  const [snapshot, setSnapshot] = useState(() => getCached<Snapshot>(cacheKey))
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++generation.current
    setLoading(true); setError('')
    try {
      const [access, briefs] = await Promise.all([client.access(), allPages(after => client.list(after))])
      if (current !== generation.current) return
      const next = { access, briefs }; setSnapshot(next); setCached(cacheKey, next)
    } catch (cause) { if (current === generation.current) setError(equipmentError(cause)) }
    finally { if (current === generation.current) setLoading(false) }
  }, [client, cacheKey])
  useEffect(() => {
    const lifecycle = generation
    void refresh()
    return () => { lifecycle.current++ }
  }, [refresh])
  const href = (brief: ProductionBrief) => `/production/?${preview ? '' : `organization=${encodeURIComponent(org)}&`}brief=${encodeURIComponent(brief.id)}`
  const today = new Date().toISOString().slice(0, 10)
  const attention = snapshot?.briefs.filter(b => briefNeedsAttention(b, snapshot.access)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? []
  const shoots = snapshot?.briefs.filter(b => {
    if (['draft', 'denied', 'withdrawn'].includes(b.status)) return false
    if (b.shootStartsAt) return b.shootEndsAt ? Date.parse(b.shootEndsAt) > Date.parse(today) : b.shootStartsAt.slice(0, 10) >= today
    return Boolean(b.data.fields.proposedStart) && (b.data.fields.proposedEnd || b.data.fields.proposedStart) >= today
  }).sort((a, b) => (a.shootStartsAt || a.data.fields.proposedStart).localeCompare(b.shootStartsAt || b.data.fields.proposedStart)) ?? []
  return <div className="ws-production-overview">
    {preview && <p className="ws-preview-note">Preview workspace · Example production records</p>}
    {error && <Notice kind="error"><span>Production: {error}</span><Button disabled={loading} onClick={() => void refresh()}>{loading ? 'Retrying…' : 'Retry production'}</Button></Notice>}
    {loading && !snapshot && <Skeleton label="Loading production queues…" variant="row" count={3} />}
    {snapshot && <div className="ws-queue-columns ws-stagger">
      <QueueSection title="Briefs needing attention" action={<Link href="/production/">All briefs</Link>}>
        {attention.length ? <ul className="ws-record-list ws-stagger">{attention.slice(0, 5).map(brief => <li key={brief.id}><div><Link href={href(brief)}>{brief.data.projectName || 'Untitled brief'}</Link><p>{brief.data.client || 'Client not added'}</p></div><StatusLabel tone={brief.status === 'changes_requested' ? 'warning' : brief.status === 'submitted' ? 'accent' : 'neutral'}>{statusLabels[brief.status]}</StatusLabel></li>)}</ul> : <EmptyState title="No briefs need your attention." />}
      </QueueSection>
      <QueueSection title="Upcoming productions" action={<Button disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh production'}</Button>}>
        {shoots.length ? <ul className="ws-record-list ws-stagger">{shoots.slice(0, 5).map(brief => <li key={brief.id}><div><Link href={href(brief)}>{brief.data.projectName || 'Untitled brief'}</Link><p>{brief.data.client} · {brief.shootStartsAt ? 'Confirmed shoot' : 'Tentative shoot'}</p></div><time dateTime={(brief.shootStartsAt || brief.data.fields.proposedStart).slice(0, 10)}>{dateLabel(brief.shootStartsAt || brief.data.fields.proposedStart)}</time></li>)}</ul> : <EmptyState title="No upcoming shoots scheduled." />}
      </QueueSection>
    </div>}
  </div>
}
