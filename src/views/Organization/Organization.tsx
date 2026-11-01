'use client'

import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { HiOutlineArrowUpRight, HiOutlinePlus, HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2'

type Role = 'Administrator' | 'Member'
type Status = 'Active' | 'Invited' | 'Suspended'
interface Member { id: string; name: string; email: string; role: Role; status: Status }
interface OrganizationData { name: string; initials: string; members: Member[]; activity: string[]; reservationDays: number }
type DialogState = { type: 'invite' } | { type: 'role' | 'status'; member: Member } | null

// Fictional, in-memory preview data. Never used as authentication or authorization.
function initialOrganizations(): Record<string, OrganizationData> {
  return {
    uf: { name: 'The Agency at UF', initials: 'UF', reservationDays: 7, activity: [], members: [
      { id: 'uf-1', name: 'Morgan Lee', email: 'morgan@example.com', role: 'Administrator', status: 'Active' },
      { id: 'uf-2', name: 'Alex Rivera', email: 'alex@example.com', role: 'Member', status: 'Active' },
      { id: 'uf-3', name: 'Jamie Park', email: 'jamie@example.com', role: 'Member', status: 'Active' },
      { id: 'uf-4', name: 'Taylor Chen', email: 'taylor@example.com', role: 'Member', status: 'Invited' },
      { id: 'uf-5', name: 'Casey Brooks', email: 'casey@example.com', role: 'Member', status: 'Suspended' },
    ] },
    northline: { name: 'Northline Studio', initials: 'NS', reservationDays: 5, activity: [], members: [
      { id: 'ns-1', name: 'Sam Ellis', email: 'sam@example.com', role: 'Administrator', status: 'Active' },
      { id: 'ns-2', name: 'Robin Avery', email: 'robin@example.com', role: 'Member', status: 'Active' },
    ] },
  }
}

function PreviewDialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const element = ref.current
    if (!trigger.current && document.activeElement instanceof HTMLElement) trigger.current = document.activeElement
    if (element && !element.open) {
      if (typeof element.showModal === 'function') element.showModal()
      else element.setAttribute('open', '')
    }
    element?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      trigger.current?.focus()
    }
  }, [])
  return <dialog ref={ref} className="org-dialog" aria-labelledby="org-dialog-title" onCancel={close} onClose={close}>
    <div className="org-dialog-heading"><h2 id="org-dialog-title">{title}</h2>
      <button type="button" onClick={close} aria-label="Close dialog"><HiOutlineXMark /></button></div>
    {children}
  </dialog>
}

export default function Organization({ isAdmin, initialTab = 'members' }: { isAdmin: boolean; initialTab?: 'members' | 'activity' | 'settings' }) {
  const [organizations, setOrganizations] = useState(initialOrganizations)
  const [organizationId, setOrganizationId] = useState('uf')
  const [tab, setTab] = useState<'members' | 'activity' | 'settings'>(initialTab)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const org = organizations[organizationId]
  const active = org.members.filter(member => member.status === 'Active')
  const invited = org.members.filter(member => member.status === 'Invited')
  const visibleMembers = org.members.filter(member =>
    `${member.name} ${member.email}`.toLowerCase().includes(search.toLowerCase()) &&
    (statusFilter === 'All statuses' || member.status === statusFilter))
  const visibleAdmins = visibleMembers.filter(member => member.role === 'Administrator')
  const visibleRegular = visibleMembers.filter(member => member.role === 'Member')

  function update(next: OrganizationData, activity: string) {
    setOrganizations(previous => ({ ...previous, [organizationId]: { ...next, activity: [activity, ...org.activity] } }))
    setNotice(activity)
  }
  function openDialog(next: DialogState) { setError(''); setDialog(next) }
  const avatar = (member: Member) => <span className="org-avatar" aria-hidden="true">{member.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>
  const actions = (member: Member) => <div className="org-row-actions"><button aria-label={`Change role for ${member.name}`} onClick={() => openDialog({ type: 'role', member })}>Change role</button>
    <button aria-label={`${member.status === 'Invited' ? 'Revoke invitation for' : member.status === 'Suspended' ? 'Restore' : 'Suspend'} ${member.name}`} onClick={() => openDialog({ type: 'status', member })}>{member.status === 'Invited' ? 'Revoke' : member.status === 'Suspended' ? 'Restore' : 'Suspend'}</button></div>
  const status = (member: Member) => <span className={`org-status org-status-${member.status.toLowerCase()}`}>{member.status}</span>
  function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const name = String(form.get('name') ?? '').trim()
    const role = form.get('role') === 'Administrator' ? 'Administrator' : 'Member'
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a name and valid email address.'); return }
    if (org.members.some(member => member.email.toLowerCase() === email)) { setError('This email is already in this organization.'); return }
    update({ ...org, members: [...org.members, { id: crypto.randomUUID(), name, email, role, status: 'Invited' }] }, `Preview invitation created for ${name}. No email was sent.`)
    setDialog(null)
  }
  function changeMember(member: Member, changes: Partial<Member>, message: string) {
    if (member.role === 'Administrator' && member.status === 'Active' &&
      (changes.role === 'Member' || changes.status === 'Suspended') &&
      active.filter(item => item.role === 'Administrator').length <= 1) {
      setError('Keep at least one active administrator in this organization.'); return
    }
    update({ ...org, members: org.members.map(item => item.id === member.id ? { ...item, ...changes } : item) }, message)
    setDialog(null)
  }

  if (!isAdmin) return <main className="organization-page"><h1>Organization administration</h1><p>You must be an admin to preview this workspace.</p></main>

  return <main className="organization-page">
    <div className="org-preview"><span>UI preview</span><p>Fictional organizations and users. Changes reset on refresh; no emails, AWS changes, or real permissions.</p></div>
    <header className="org-heading">
      <div><p className="eyebrow">Organization administration</p><h1>Your organization.</h1><p>People, access, and policies. One workspace, your team.</p></div>
      <label className="org-switcher">Preview organization<select aria-label="Preview organization" value={organizationId} onChange={event => {
        setOrganizationId(event.target.value); setSearch(''); setStatusFilter('All statuses'); setNotice(''); setDialog(null)
      }}>{Object.entries(organizations).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
    </header>
    <section className="org-workspace" aria-label={org.name}>
      <div className="org-identity"><span className="org-monogram" aria-hidden="true">{org.initials}</span>
        <div><h2>{org.name}</h2><p>Previewing organization administrator access</p></div>
        <div className="org-counts"><span><strong>{active.length}</strong> active members</span><span><strong>{invited.length}</strong> pending invitations</span></div>
      </div>
      <nav className="org-tabs" aria-label="Organization sections">
        {(['members', 'activity', 'settings'] as const).map(item => <button key={item} className={tab === item ? 'selected' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === 'members' ? 'Members & access' : item === 'activity' ? 'Activity' : 'Settings'}</button>)}
      </nav>
      {notice && <p className="org-notice" role="status">{notice}</p>}
      {tab === 'members' && <>
        <div className="org-section-heading"><div><h3>Members & access</h3><p>Manage membership for {org.name} only.</p></div><button className="org-primary" onClick={() => openDialog({ type: 'invite' })}><HiOutlinePlus /> Invite member</button></div>
        <div className="org-filters"><label className="org-search"><HiOutlineMagnifyingGlass /><input aria-label="Search members" placeholder="Search by name or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <select aria-label="Filter by status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>{['All statuses', 'Active', 'Invited', 'Suspended'].map(status => <option key={status}>{status}</option>)}</select>
        </div>
        <section className="org-group" aria-labelledby="org-admin-heading"><h4 id="org-admin-heading">Admin</h4>
          {visibleAdmins.length ? <ul className="org-admin-cards">{visibleAdmins.map(member => <li key={member.id}>
            <div className="org-member">{avatar(member)}<div><strong>{member.name}</strong><span>{member.email}</span></div></div>
            <div className="org-admin-meta">{status(member)}{actions(member)}</div>
          </li>)}</ul> : <p className="org-empty">No admins match your search.</p>}
        </section>
        <section className="org-group" aria-labelledby="org-members-heading"><h4 id="org-members-heading">Members</h4>
        <div className="org-table-scroll"><table className="org-table"><thead><tr><th>Member</th><th>Status</th><th>Manage</th></tr></thead><tbody>
          {visibleRegular.map(member => <tr key={member.id}>
            <td><div className="org-member">{avatar(member)}<div><strong>{member.name}</strong><span>{member.email}</span></div></div></td>
            <td>{status(member)}</td><td>{actions(member)}</td>
          </tr>)}
          {!visibleRegular.length && <tr><td colSpan={3} className="org-empty">No members match your search. Try another name or status.</td></tr>}
        </tbody></table></div>
        </section>
        <p className="org-scope-note">Organization roles apply here only. Platform administration is separate.</p>
      </>}
      {tab === 'activity' && <div className="org-section"><h3>Organization activity</h3><p>Local preview actions for {org.name}; not a production audit log.</p>
        {org.activity.length ? <ol className="org-activity">{org.activity.map((item, index) => <li key={`${index}-${item}`}><span>{String(org.activity.length - index).padStart(2, '0')}</span>{item}</li>)}</ol> : <div className="org-empty">No preview changes yet. Invite a member or update a role to see activity here.</div>}
      </div>}
      {tab === 'settings' && <div className="org-section"><h3>Organization settings</h3><p>Preview preferences only. Backend enforcement and institutional SSO are not connected.</p>
        <form key={organizationId} className="org-settings" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('organizationName') ?? '').trim(); const days = Number(data.get('days'))
          if (!name || !Number.isInteger(days) || days < 1 || days > 30) return
          update({ ...org, name, reservationDays: days }, 'Organization settings saved for this preview only.')
        }}><label>Organization name<input name="organizationName" defaultValue={org.name} maxLength={80} required /></label>
          <label>Default reservation length (days)<input name="days" type="number" defaultValue={org.reservationDays} min={1} max={30} required /></label>
          <div className="org-sso"><span>Institutional sign-in</span><strong>Not connected</strong><p>Cognito and institution approval are required before enabling SSO.</p></div>
          <button className="org-primary" type="submit">Save preview settings <HiOutlineArrowUpRight /></button>
        </form>
      </div>}
    </section>
    <p className="org-page-note">StudioStack / Organization workspace</p>
    {dialog && <PreviewDialog title={dialog.type === 'invite' ? 'Invite a member' : dialog.type === 'role' ? 'Change organization role' : dialog.member.status === 'Invited' ? 'Revoke invitation' : dialog.member.status === 'Suspended' ? 'Restore membership' : 'Suspend membership'} close={() => setDialog(null)}>
      {error && <p className="org-error" role="alert">{error}</p>}
      {dialog.type === 'invite' ? <form className="org-dialog-form" onSubmit={submitInvite}>
        <p>Add someone to {org.name}. This preview will not send an email.</p>
        <label>Full name<input name="name" data-autofocus maxLength={80} required /></label>
        <label>Email address<input name="email" type="email" maxLength={254} required /></label>
        <label>Organization role<select name="role"><option>Member</option><option>Administrator</option></select></label>
        <div className="org-dialog-actions"><button type="button" onClick={() => setDialog(null)}>Cancel</button><button className="org-primary" type="submit">Create preview invitation</button></div>
      </form> : dialog.type === 'role' ? <form className="org-dialog-form" onSubmit={event => {
        event.preventDefault(); const role: Role = new FormData(event.currentTarget).get('role') === 'Administrator' ? 'Administrator' : 'Member'
        changeMember(dialog.member, { role }, `${dialog.member.name}'s preview role changed to ${role.toLowerCase()}.`)
      }}><p>{dialog.member.name}&apos;s role in {org.name}. Other organizations are unaffected.</p>
        <label>Organization role<select name="role" defaultValue={dialog.member.role} data-autofocus><option>Member</option><option>Administrator</option></select></label>
        <div className="org-dialog-actions"><button type="button" onClick={() => setDialog(null)}>Cancel</button><button className="org-primary" type="submit">Save role</button></div>
      </form> : <div className="org-dialog-form"><p>{dialog.member.status === 'Invited' ? 'Remove this preview invitation' : dialog.member.status === 'Suspended' ? 'Restore this preview membership' : 'Suspend this preview membership'} for {dialog.member.name} in {org.name}? This does not delete their identity or affect another organization.</p>
        <div className="org-dialog-actions"><button data-autofocus onClick={() => setDialog(null)}>Cancel</button><button className="org-primary" onClick={() => {
          if (dialog.member.status === 'Invited') { update({ ...org, members: org.members.filter(member => member.id !== dialog.member.id) }, `Preview invitation revoked for ${dialog.member.name}.`); setDialog(null) }
          else { const status = dialog.member.status === 'Suspended' ? 'Active' : 'Suspended'; changeMember(dialog.member, { status }, `${dialog.member.name}'s preview membership ${status === 'Active' ? 'restored' : 'suspended'}.`) }
        }}>Confirm preview change</button></div>
      </div>}
    </PreviewDialog>}
  </main>
}
