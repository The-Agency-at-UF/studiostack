'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { HiOutlineMagnifyingGlass, HiOutlinePlus } from 'react-icons/hi2'
import { createDatabaseApiClient, DatabaseApiClientError } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import { useAppSession } from '../../context/AppSessionContext'
import { EmptyState, Notice, Select, Skeleton, StatusLabel, TableRegion } from '../../components/workspace/WorkspaceUI'
import type { ApiPage } from '../../types/database-api'
import type { OrganizationInvitation, OrganizationSettings } from '../../types/accounts'
import './OrganizationDirectory.css'
import OrganizationJoinCode from './OrganizationJoinCode'

type Role = OrganizationSettings['role']
// Members only ever receive id, name and role; email and status are filled in for owners and admins.
interface Person { id: string; name: string; named: boolean; role: Role; email?: string; status?: 'active' | 'suspended' }

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
const rank: Record<Role, number> = { owner: 0, admin: 1, member: 2 }
const roleLabel: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export default function OrganizationDirectory() {
  const session = useAppSession(), org = session.selectedOrganizationId ?? session.organizations?.[0]?.id
  const api = useMemo(() => org && session.getAccessToken ? createDatabaseApiClient({ baseUrl: authConfiguration().apiUrl, getAccessToken: session.getAccessToken }).accounts(org) : null, [org, session.getAccessToken])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admins' | 'members'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')

  useEffect(() => {
    let current = true
    setSettings(null); setPeople([]); setInvitations([]); setError(''); setSearch(''); setRoleFilter('all'); setStatusFilter('all'); setLoading(true)
    async function load() {
      if (!api) return
      const s = await api.settings()
      if (['owner', 'admin'].includes(s.role)) {
        const [members, rows] = await Promise.all([all(api.members), all(api.invitations)])
        if (!current) return
        setPeople(members.filter(m => m.status !== 'invited').map(m => ({ id: m.id, name: m.displayName ?? m.email ?? 'Team member', named: Boolean(m.displayName), role: m.role, email: m.email ?? undefined, status: m.status === 'suspended' ? 'suspended' : 'active' })))
        setInvitations(rows.filter(i => i.status === 'pending' && Date.parse(i.expiresAt) > Date.now()))
      } else {
        const directory = await all(api.directory)
        if (!current) return
        setPeople(directory.map(m => ({ id: m.id, name: m.displayName, named: true, role: m.role })))
      }
      setSettings(s)
    }
    load().catch(e => { if (current) setError(message(e)) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api])

  const manager = settings?.role === 'owner' || settings?.role === 'admin'
  const me = session.email?.trim().toLowerCase()
  const sorted = [...people].sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name))
  const adminCount = people.filter(p => p.role !== 'member').length
  const query = search.trim().toLowerCase()
  const visible = sorted.filter(p => `${p.name} ${p.email ?? ''}`.toLowerCase().includes(query)
    && (roleFilter === 'all' || (roleFilter === 'admins') === (p.role !== 'member'))
    && (statusFilter === 'all' || p.status === statusFilter))
  const filtered = query !== '' || roleFilter !== 'all' || statusFilter !== 'all'

  return <main className="org-directory workspace-surface">
    <header className="org-directory-heading">
      <span className="org-directory-monogram" aria-hidden="true">{settings ? initials(settings.name) : ''}</span>
      <div className="org-directory-title">
        <p className="org-directory-eyebrow">Organization</p>
        <h1>{settings?.name ?? 'Your organization'}</h1>
        {settings && <p>{people.length} {people.length === 1 ? 'person' : 'people'} · {plural(adminCount, 'admin')} · You&apos;re {settings.role === 'member' ? 'a member' : `an ${settings.role}`}</p>}
      </div>
      {manager && <Link className="ws-button ws-button-primary org-directory-invite" href="/organization/settings"><HiOutlinePlus aria-hidden="true" />Invite people</Link>}
    </header>
    {manager && <nav className="org-directory-tabs" aria-label="Organization sections">
      <Link href="/organization" aria-current="page">People <span className="org-directory-tab-count">{people.length}</span></Link>
      <Link href="/organization/settings">Invitations &amp; settings</Link>
    </nav>}
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <Skeleton label="Loading organization…" variant="row" count={4} />}
    {!org && !loading && <EmptyState title="Select an organization to continue." />}
    {settings && <>
      {manager && api && <OrganizationJoinCode key={org} api={api} name={settings.name} />}
      <section className="org-directory-card org-directory-people" aria-labelledby="org-people">
        <div className="org-directory-card-heading">
          <h2 id="org-people">People</h2>
          <p>Owners and admins manage people and settings.</p>
        </div>
        <div className="org-directory-filters">
          <label className="org-directory-search"><HiOutlineMagnifyingGlass aria-hidden="true" /><input aria-label="Search people" placeholder={manager ? 'Search by name or email' : 'Search by name'} value={search} onChange={event => setSearch(event.target.value)} /></label>
          <Select aria-label="Filter by role" value={roleFilter} onChange={event => setRoleFilter(event.target.value as typeof roleFilter)}>
            <option value="all">All roles</option><option value="admins">Owners &amp; admins</option><option value="members">Members</option>
          </Select>
          {manager && <Select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </Select>}
        </div>
        {visible.length ? <TableRegion label="People in this organization" className="org-directory-table">
          <table>
            <thead><tr><th scope="col">Person</th><th scope="col">Role</th>{manager && <th scope="col">Status</th>}</tr></thead>
            <tbody>{visible.map(person => {
              const you = Boolean(me && person.email?.toLowerCase() === me)
              return <tr key={person.id}>
                <td><div className="org-directory-person">
                  <span className={`org-directory-avatar org-directory-avatar-${person.role}`} aria-hidden="true">{person.named ? initials(person.name) : '?'}</span>
                  <div>
                    <strong>{person.name}{you && <span className="org-directory-you"> (you)</span>}</strong>
                    {person.email && <small>{person.named ? person.email : 'No display name yet'}</small>}
                  </div>
                </div></td>
                <td><StatusLabel tone={person.role === 'owner' ? 'accent' : 'neutral'}>{roleLabel[person.role]}</StatusLabel></td>
                {manager && <td><span className={`org-directory-status org-directory-status-${person.status}`}>{person.status === 'suspended' ? 'Suspended' : 'Active'}</span></td>}
              </tr>
            })}</tbody>
          </table>
        </TableRegion> : <EmptyState title={filtered ? 'No one matches these filters.' : 'No one has joined yet.'} />}
        <div className="org-directory-footer">
          {manager ? (invitations.length
            ? <Link href="/organization/settings">{plural(invitations.length, 'pending invitation')}</Link>
            : <span>No pending invitations</span>) : <span />}
          <span role="status">Showing {visible.length} of {people.length}</span>
        </div>
      </section>
      {manager && invitations.length > 0 && <section className="org-directory-card" aria-labelledby="org-invitations">
        <div className="org-directory-card-heading">
          <h2 id="org-invitations">Pending invitations</h2>
          <Link className="org-directory-action" href="/organization/settings">Manage invitations</Link>
        </div>
        <ul className="org-directory-list">{invitations.map(invitation => <li key={invitation.id}>
          <span className="org-directory-avatar" aria-hidden="true">{initials(invitation.displayName)}</span>
          <div><strong>{invitation.displayName}</strong><small>{invitation.email} · {invitation.role === 'admin' ? 'Admin' : 'Member'} · Expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></div>
        </li>)}</ul>
      </section>}
    </>}
  </main>
}
