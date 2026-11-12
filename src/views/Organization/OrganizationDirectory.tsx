'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { HiOutlineMagnifyingGlass, HiOutlinePlus, HiOutlineXMark } from 'react-icons/hi2'
import { createDatabaseApiClient, DatabaseApiClientError } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import { useAppSession } from '../../context/AppSessionContext'
import { DetailPanel, EmptyState, Notice, Select, Skeleton, StatusLabel, TableRegion } from '../../components/workspace/WorkspaceUI'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import type { AccountClient } from '../../api/accounts'
import type { ApiPage } from '../../types/database-api'
import type { OrganizationSettings } from '../../types/accounts'
import './OrganizationDirectory.css'
import OrganizationHeader from './OrganizationHeader'
import OrganizationJoinCode from './OrganizationJoinCode'

type Role = OrganizationSettings['role']
type Status = 'active' | 'suspended'
// Members only ever receive id, name and role; email, status and version are filled in for owners and admins.
interface Person { id: string; name: string; named: boolean; role: Role; email?: string; status?: Status; version?: number }

async function all<T>(read: (after?: string) => Promise<ApiPage<T>>) {
  const items: T[] = []
  let after: string | undefined
  do { const page = await read(after); items.push(...page.items); after = page.nextCursor ?? undefined } while (after)
  return items
}
const status = (error: unknown) => error instanceof DatabaseApiClientError ? error.status : 0
const loadMessage = (error: unknown) => status(error) === 401 ? 'Your session expired. Sign in again.'
  : status(error) === 403 ? 'Your account is not an active member of this organization.'
  : 'The organization directory is unavailable. Try again shortly.'
const actionMessage = (error: unknown) => ({ 400: 'Check the details and try again.', 401: 'Your session expired. Sign in again.', 403: 'Your account cannot make this change.', 409: 'Someone else changed this person. Refresh and try again.' } as Record<number, string>)[status(error)]
  ?? 'The service is unavailable. Your change has not been confirmed.'
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?'
const rank: Record<Role, number> = { owner: 0, admin: 1, member: 2 }
const roleLabel: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' }
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

export default function OrganizationDirectory() {
  const session = useAppSession(), org = session.selectedOrganizationId ?? session.organizations?.[0]?.id
  const api = useMemo(() => org && session.getAccessToken ? createDatabaseApiClient({ baseUrl: authConfiguration().apiUrl, getAccessToken: session.getAccessToken }).accounts(org) : null, [org, session.getAccessToken])
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [pendingInvitations, setPendingInvitations] = useState(0)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(''), [notice, setNotice] = useState('')
  const [inviting, setInviting] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admins' | 'members'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const generation = useRef(0)
  // A retried change keeps its request ID so the server can recognize the repeat.
  const mutation = useRef<{ key: string; id: string } | null>(null)

  const load = useCallback(async () => {
    if (!api) return
    const g = generation.current, s = await api.settings()
    if (['owner', 'admin'].includes(s.role)) {
      const [members, rows] = await Promise.all([all(api.members), all(api.invitations)])
      if (g !== generation.current) return
      setPeople(members.filter(m => m.status !== 'invited').map(m => ({ id: m.id, name: m.displayName ?? m.email ?? 'Team member', named: Boolean(m.displayName), role: m.role, email: m.email ?? undefined, status: m.status === 'suspended' ? 'suspended' : 'active', version: m.version })))
      setPendingInvitations(rows.filter(i => i.status === 'pending' && Date.parse(i.expiresAt) > Date.now()).length)
    } else {
      const directory = await all(api.directory)
      if (g !== generation.current) return
      setPeople(directory.map(m => ({ id: m.id, name: m.displayName, named: true, role: m.role })))
    }
    setSettings(s)
  }, [api])

  useEffect(() => {
    const g = ++generation.current
    setSettings(null); setPeople([]); setPendingInvitations(0); setError(''); setActionError(''); setNotice(''); setBusy(false); setInviting(false)
    setSearch(''); setRoleFilter('all'); setStatusFilter('all'); setSelectedId(null); setLoading(true)
    load().catch(e => { if (g === generation.current) setError(loadMessage(e)) }).finally(() => { if (g === generation.current) setLoading(false) })
    return () => { generation.current++ }
  }, [load])

  async function run(key: string, done: string, task: (client: AccountClient, requestId: string) => Promise<unknown>) {
    if (!api || busy) return false
    const g = generation.current
    if (mutation.current?.key !== key) mutation.current = { key, id: crypto.randomUUID() }
    setBusy(true); setActionError(''); setNotice('')
    try {
      await task(api, mutation.current.id)
      if (g !== generation.current) return false
      mutation.current = null
      setNotice(done)
      await load()
      return true
    } catch (e) { if (g === generation.current) setActionError(actionMessage(e)); return false }
    finally { if (g === generation.current) setBusy(false) }
  }
  const change = (person: Person, role: Role, next: Status, done: string) => {
    void run(JSON.stringify({ member: person.id, version: person.version, role, status: next }), done,
      (client, requestId) => client.updateMember(person.id, { role, status: next, version: person.version!, requestId }))
  }

  const owner = settings?.role === 'owner'
  const manager = owner || settings?.role === 'admin'
  const me = session.email?.trim().toLowerCase()
  const sorted = [...people].sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name))
  const adminCount = people.filter(p => p.role !== 'member').length
  const query = search.trim().toLowerCase()
  const visible = sorted.filter(p => `${p.name} ${p.email ?? ''}`.toLowerCase().includes(query)
    && (roleFilter === 'all' || (roleFilter === 'admins') === (p.role !== 'member'))
    && (statusFilter === 'all' || p.status === statusFilter))
  // Owners manage everyone; admins manage everyone except owners. Nobody changes their own access here.
  const isYou = (person: Person) => Boolean(me && person.email?.toLowerCase() === me)
  const manageable = (person: Person) => manager && !isYou(person) && (owner || person.role !== 'owner')
  const selected = people.find(person => person.id === selectedId && manageable(person))
  const closePanel = () => {
    const id = selectedId
    setSelectedId(null)
    if (id) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-manage="${id}"]`)?.focus())
  }
  const filtered = query !== '' || roleFilter !== 'all' || statusFilter !== 'all'

  return <main className="org-directory workspace-surface">
    <OrganizationHeader settings={settings} active="people"
      summary={settings && <>{people.length} {people.length === 1 ? 'person' : 'people'} · {plural(adminCount, 'admin')} · You&apos;re {settings.role === 'member' ? 'a member' : `an ${settings.role}`}</>}
      action={manager && <button type="button" className="ws-button ws-button-primary org-directory-invite" aria-expanded={inviting} aria-controls="org-invite" onClick={() => setInviting(open => !open)}><HiOutlinePlus aria-hidden="true" />Invite people</button>} />
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <Skeleton label="Loading organization…" variant="row" count={4} />}
    {!org && !loading && <EmptyState title="Select an organization to continue." />}
    {settings && <>
      {manager && inviting && <InviteForm busy={busy} onCancel={() => setInviting(false)} onInvite={async input => {
        const sent = await run(JSON.stringify({ invite: input }), `Invitation sent to ${input.email}.`, (client, requestId) => client.invite({ ...input, requestId }))
        if (sent) setInviting(false)
        return sent
      }} />}
      {manager && api && <OrganizationJoinCode key={org} api={api} name={settings.name} />}
      <div className="org-directory-layout">
      <section className="org-directory-card org-directory-people" aria-labelledby="org-people">
        <div className="org-directory-card-heading">
          <h2 id="org-people">People</h2>
          <p>{owner ? 'Change anyone’s role or access from Manage.' : manager ? 'Owners and admins manage people. Only owners can change an owner.' : 'Owners and admins manage people and settings.'}</p>
        </div>
        {actionError && <Notice kind="error">{actionError}</Notice>}
        {notice && <Notice kind="success">{notice}</Notice>}
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
            <thead><tr><th scope="col">Person</th><th scope="col">Role</th>{manager && <><th scope="col">Status</th><th scope="col"><span className="ws-sr-only">Manage</span></th></>}</tr></thead>
            <tbody>{visible.map(person => {
              const you = isYou(person), open = selected?.id === person.id
              return <tr key={person.id} className={open ? 'is-selected' : undefined}>
                <td><div className="org-directory-person">
                  <span className={`org-directory-avatar org-directory-avatar-${person.role}`} aria-hidden="true">{person.named ? initials(person.name) : '?'}</span>
                  <div>
                    <strong>{person.name}{you && <span className="org-directory-you"> (you)</span>}</strong>
                    {person.email && <small>{person.named ? person.email : 'No display name yet'}</small>}
                  </div>
                </div></td>
                <td><StatusLabel tone={person.role === 'owner' ? 'accent' : 'neutral'}>{roleLabel[person.role]}</StatusLabel></td>
                {manager && <>
                  <td><span className={`org-directory-status org-directory-status-${person.status}`}>{person.status === 'suspended' ? 'Suspended' : 'Active'}</span></td>
                  <td className="org-directory-manage-cell">{manageable(person) && <button type="button" className="ws-button org-directory-manage" data-manage={person.id} aria-label={`Manage ${person.name}`} aria-expanded={open} aria-controls={open ? 'org-person-panel' : undefined} onClick={() => open ? closePanel() : setSelectedId(person.id)}>Manage</button>}</td>
                </>}
              </tr>
            })}</tbody>
          </table>
        </TableRegion> : <EmptyState title={filtered ? 'No one matches these filters.' : 'No one has joined yet.'} />}
        <div className="org-directory-footer">
          {manager ? (pendingInvitations
            ? <Link href="/organization/settings#invitations">{plural(pendingInvitations, 'pending invitation')}</Link>
            : <span>No pending invitations</span>) : <span />}
          <span>Showing {visible.length} of {people.length}</span>
        </div>
      </section>
      {selected && <PersonPanel key={selected.id} person={selected} owner={owner} busy={busy} change={change} onClose={closePanel} />}
      </div>
    </>}
  </main>
}

function InviteForm({ busy, onCancel, onInvite }: { busy: boolean; onCancel: () => void; onInvite: (input: { email: string; role: 'member' | 'admin' }) => Promise<boolean> }) {
  const [email, setEmail] = useState(''), [role, setRole] = useState<'member' | 'admin'>('member')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { field.current?.focus() }, [])
  function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !email.trim()) return
    void onInvite({ email: email.trim(), role })
  }
  return <section id="org-invite" className="org-directory-card org-directory-invite-card" aria-labelledby="org-invite-title">
    <h2 id="org-invite-title">Invite people</h2>
    <form className="org-directory-invite-form" onSubmit={submit}>
      <label className="ws-field">Email<input ref={field} type="email" maxLength={254} required placeholder="name@school.edu" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="ws-field">Role<Select value={role} onChange={event => setRole(event.target.value as typeof role)}><option value="member">Member</option><option value="admin">Admin</option></Select></label>
      <div className="org-directory-invite-actions">
        <button type="submit" className="ws-button ws-button-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invitation'}</button>
        <button type="button" className="ws-button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
    <p className="org-directory-hint">Invitations expire after seven days. Track or revoke them under Access &amp; settings.</p>
  </section>
}

type Change = (person: Person, role: Role, status: Status, done: string) => void
const roleDetails: Record<Role, string> = {
  member: 'Books gear and joins productions.',
  admin: 'Also manages people, equipment and settings.',
  owner: 'Full control, including other owners and workspace domains.',
}
function PersonPanel({ person, owner, busy, change, onClose }: { person: Person; owner: boolean; busy: boolean; change: Change; onClose: () => void }) {
  // The draft belongs to the version it was made against, so a reload after saving shows the confirmed role.
  const [draft, setDraft] = useState<{ version?: number; role: Role } | null>(null)
  const [confirm, setConfirm] = useState<'suspend' | 'owner' | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [person.id])
  const role = draft && draft.version === person.version ? draft.role : person.role
  const roles: Role[] = owner ? ['member', 'admin', 'owner'] : ['member', 'admin']
  const suspended = person.status === 'suspended'
  function save(event: FormEvent) {
    event.preventDefault()
    if (busy || role === person.role) return
    if (role === 'owner') setConfirm('owner')
    else change(person, role, person.status!, `${person.name} is now ${role === 'admin' ? 'an admin' : 'a member'}.`)
  }
  return <DetailPanel className="org-person-panel" label={`Manage ${person.name}`}>
    <div id="org-person-panel" onKeyDown={event => { if (event.key === 'Escape' && !confirm) { event.stopPropagation(); onClose() } }}>
      <div className="org-person-head">
        <span className={`org-directory-avatar org-directory-avatar-${person.role}`} aria-hidden="true">{person.named ? initials(person.name) : '?'}</span>
        <div>
          <h2 ref={heading} tabIndex={-1}>{person.name}</h2>
          {person.email && <small>{person.named ? person.email : 'No display name yet'}</small>}
        </div>
        <button type="button" className="org-person-close" aria-label="Close details" onClick={onClose}><HiOutlineXMark aria-hidden="true" /></button>
      </div>
      <form className="org-person-section" onSubmit={save}>
        <fieldset disabled={busy}>
          <legend>Role</legend>
          {roles.map(option => <label key={option} className="org-person-role">
            <input type="radio" name="org-person-role" value={option} checked={role === option} onChange={() => setDraft({ version: person.version, role: option })} />
            <span><strong>{roleLabel[option]}</strong><small>{roleDetails[option]}</small></span>
            {option === person.role && <span className="org-person-current">Current</span>}
          </label>)}
        </fieldset>
        <button type="submit" className="ws-button ws-button-primary" disabled={busy || role === person.role}>Save role</button>
      </form>
      <section className="org-person-section" aria-labelledby="org-person-access">
        <h3 id="org-person-access">Access</h3>
        <p><span className={`org-directory-status org-directory-status-${person.status}`}>{suspended ? 'Suspended' : 'Active'}</span></p>
        <p className="org-person-note">{suspended ? 'They can’t use this organization. Their booking history is kept.' : 'They can sign in, book gear and join productions.'}</p>
        {suspended
          ? <button type="button" className="ws-button" disabled={busy} onClick={() => change(person, person.role, 'active', `${person.name} has access again.`)}>Restore access</button>
          : <button type="button" className="ws-button ws-button-danger" disabled={busy} onClick={() => setConfirm('suspend')}>Suspend access</button>}
      </section>
    </div>
    {confirm === 'suspend' && <ConfirmDialog title="Suspend access?" subject={person.name} confirmLabel="Suspend access"
      description="This suspends their organization access and removes their production leadership permissions. Their booking history is kept. You can restore access later."
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); change(person, person.role, 'suspended', `${person.name}’s access is suspended.`) }} />}
    {confirm === 'owner' && <ConfirmDialog title="Make this person an owner?" subject={person.name} confirmLabel="Make owner"
      description="Owners can change anyone’s role or access, including other owners, and manage workspace domains."
      onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); change(person, 'owner', person.status!, `${person.name} is now an owner.`) }} />}
  </DetailPanel>
}
