'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2'
import { createDatabaseApiClient, DatabaseApiClientError } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import { useAppSession } from '../../context/AppSessionContext'
import { EmptyState, Notice, StatusLabel } from '../../components/workspace/WorkspaceUI'
import type { ApiPage } from '../../types/database-api'
import type { OrganizationInvitation, OrganizationSettings } from '../../types/accounts'
import './OrganizationDirectory.css'

type Role = OrganizationSettings['role']
// Members only ever receive id, name and role; email and status are filled in for owners and admins.
interface Person { id: string; name: string; role: Role; email?: string; status?: 'active' | 'suspended' }

async function all<T>(read: (after?: string) => Promise<ApiPage<T>>) {
  const items: T[] = []
  let after: string | undefined
  do { const page = await read(after); items.push(...page.items); after = page.nextCursor ?? undefined } while (after)
  return items
}
const message = (error: unknown) => error instanceof DatabaseApiClientError && error.status === 401 ? 'Your session expired. Sign in again.'
  : error instanceof DatabaseApiClientError && error.status === 403 ? 'Your account is not an active member of this organization.'
  : 'The organization directory is unavailable. Try again shortly.'
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?'
const byName = (a: Person, b: Person) => a.name.localeCompare(b.name)

export default function OrganizationDirectory() {
  const session = useAppSession(), org = session.selectedOrganizationId ?? session.organizations?.[0]?.id
  const api = useMemo(() => org && session.getAccessToken ? createDatabaseApiClient({ baseUrl: authConfiguration().apiUrl, getAccessToken: session.getAccessToken }).accounts(org) : null, [org, session.getAccessToken])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [search, setSearch] = useState(''), [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')

  useEffect(() => {
    let current = true
    setSettings(null); setPeople([]); setInvitations([]); setError(''); setSearch(''); setStatusFilter('all'); setLoading(true)
    async function load() {
      if (!api) return
      const s = await api.settings()
      if (['owner', 'admin'].includes(s.role)) {
        const [members, rows] = await Promise.all([all(api.members), all(api.invitations)])
        if (!current) return
        setPeople(members.filter(m => m.status !== 'invited').map(m => ({ id: m.id, name: m.displayName ?? 'Team member', role: m.role, email: m.email ?? undefined, status: m.status === 'suspended' ? 'suspended' : 'active' })))
        setInvitations(rows.filter(i => i.status === 'pending' && Date.parse(i.expiresAt) > Date.now()))
      } else {
        const directory = await all(api.directory)
        if (!current) return
        setPeople(directory.map(m => ({ id: m.id, name: m.displayName, role: m.role })))
      }
      setSettings(s)
    }
    load().catch(e => { if (current) setError(message(e)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api])

  const manager = settings?.role === 'owner' || settings?.role === 'admin'
  const admins = people.filter(p => p.role !== 'member').sort((a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || byName(a, b))
  const members = people.filter(p => p.role === 'member').sort(byName)
  const query = search.trim().toLowerCase()
  const visibleMembers = members.filter(p => `${p.name} ${p.email ?? ''}`.toLowerCase().includes(query) && (statusFilter === 'all' || p.status === statusFilter))

  return <main className="org-directory workspace-surface">
    <header className="org-directory-heading">
      <span className="org-directory-monogram" aria-hidden="true">{settings ? initials(settings.name) : ''}</span>
      <div>
        <p className="org-directory-eyebrow">Organization</p>
        <h1>{settings?.name ?? 'Your organization'}</h1>
        {settings && <p>You&apos;re {settings.role === 'member' ? 'a member' : `an ${settings.role}`}</p>}
      </div>
      {settings && <dl className="org-directory-counts">
        <div><dt>Admins</dt><dd>{admins.length}</dd></div>
        <div><dt>Members</dt><dd>{members.length}</dd></div>
      </dl>}
    </header>
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <p role="status">Loading organization…</p>}
    {!org && !loading && <EmptyState title="Select an organization to continue." />}
    {settings && <>
      <section className="org-directory-section" aria-labelledby="org-admins">
        <div className="org-directory-section-heading">
          <h2 id="org-admins">Admin</h2>
          <p>Owners and admins manage people and settings.</p>
        </div>
        {admins.length ? <ul className="org-directory-cards">{admins.map(person => <li key={person.id}>
          <span className="org-directory-avatar" aria-hidden="true">{initials(person.name)}</span>
          <div>
            <strong>{person.name}</strong>
            <span className="org-directory-badges"><StatusLabel tone={person.role === 'owner' ? 'accent' : 'neutral'}>{person.role === 'owner' ? 'Owner' : 'Admin'}</StatusLabel>{person.status === 'suspended' && <StatusLabel tone="warning">Suspended</StatusLabel>}</span>
            {person.email && <small>{person.email}</small>}
          </div>
        </li>)}</ul> : <EmptyState title="No active admins." />}
      </section>
      <section className="org-directory-section" aria-labelledby="org-members">
        <div className="org-directory-section-heading">
          <h2 id="org-members">Members</h2>
          {manager && <Link className="org-directory-action" href="/users">Invite or manage people</Link>}
        </div>
        <div className="org-directory-filters">
          <label className="org-directory-search"><HiOutlineMagnifyingGlass aria-hidden="true" /><input aria-label="Search members" placeholder={manager ? 'Search by name or email' : 'Search by name'} value={search} onChange={event => setSearch(event.target.value)} /></label>
          {manager && <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </select>}
        </div>
        {visibleMembers.length ? <ul className="org-directory-list">{visibleMembers.map(person => <li key={person.id}>
          <span className="org-directory-avatar" aria-hidden="true">{initials(person.name)}</span>
          <div><strong>{person.name}</strong>{person.email && <small>{person.email}</small>}</div>
          {person.status && <StatusLabel tone={person.status === 'active' ? 'success' : 'warning'}>{person.status === 'active' ? 'Active' : 'Suspended'}</StatusLabel>}
        </li>)}</ul> : <EmptyState title={members.length ? 'No members match your search.' : 'No other members yet.'} />}
      </section>
      {manager && <section className="org-directory-section" aria-labelledby="org-invitations">
        <div className="org-directory-section-heading">
          <h2 id="org-invitations">Pending invitations</h2>
          {invitations.length > 0 && <Link className="org-directory-action" href="/users">Manage invitations</Link>}
        </div>
        {invitations.length ? <ul className="org-directory-list">{invitations.map(invitation => <li key={invitation.id}>
          <span className="org-directory-avatar" aria-hidden="true">{initials(invitation.displayName)}</span>
          <div><strong>{invitation.displayName}</strong><small>{invitation.email} · {invitation.role === 'admin' ? 'Admin' : 'Member'} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></div>
        </li>)}</ul> : <EmptyState title="No pending invitations." />}
      </section>}
    </>}
  </main>
}
