'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAppSession } from '../../context/AppSessionContext'
import { createDatabaseApiClient, DatabaseApiClientError } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import { createPreviewProductionClient, previewPeople } from '../../production/preview'
import { briefSections, emptyBrief, productionTypes, statusLabels, submissionErrors, visibleSections, type BriefCommand, type BriefData, type BriefEvent, type ProductionAccess, type ProductionBrief, type ProductionSettings } from '../../types/production'
import type { ApiMember } from '../../types/database-api'
import type { ProductionClient } from '../../api/production'
import './Production.css'
const ProductionCalendar = dynamic(() => import('./ProductionCalendar'), { ssr: false, loading: () => <p role="status">Loading calendar…</p> })
const errorText = (error: unknown) => error instanceof DatabaseApiClientError ? ({ 400: 'Check the required fields, dates and review reason.', 401: 'Your session expired. Sign in again.', 403: 'Your account does not have permission for this action.', 404: 'This record is unavailable.', 409: 'This record changed or the action conflicts with its status. Reload before trying again.', 503: 'Production services are unavailable. Your unsaved work is still here.' }[error.status] ?? 'The request failed. Try again.') : error instanceof Error ? error.message : 'Something went wrong. Try again.'
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not scheduled'
function useProductionClient(organizationId: string, person: string) {
  const session = useAppSession()
  return useMemo(() => {
    if (session.mode === 'preview') return { api: createPreviewProductionClient(person), database: null, error: '' }
    if (!session.getAccessToken || !organizationId) return { api: null, database: null, error: 'You need an active organization membership to open Production.' }
    try { const database = createDatabaseApiClient({ baseUrl: authConfiguration().apiUrl, getAccessToken: session.getAccessToken }); return { api: database.production(organizationId), database, error: '' } }
    catch { return { api: null, database: null, error: 'The authenticated production service is not configured at this address.' } }
  }, [session.mode, session.getAccessToken, organizationId, person])
}
export default function Production() {
  const session = useAppSession(), preview = session.mode === 'preview'
  const [organizationId, setOrganizationId] = useState(session.organizations?.[0]?.id ?? '')
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('organization'); if (id && session.organizations?.some(o => o.id === id)) setOrganizationId(id) }, [session.organizations])
  const [person, setPerson] = useState('preview-author')
  const { api, database, error: configurationError } = useProductionClient(organizationId, person)
  const [briefs, setBriefs] = useState<ProductionBrief[]>([]), [access, setAccess] = useState<ProductionAccess | null>(null)
  const [selected, setSelected] = useState<ProductionBrief | null>(null), [form, setForm] = useState<BriefData>(emptyBrief)
  const [tab, setTab] = useState<'briefs' | 'calendar' | 'settings'>('briefs')
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false), [snapshot, setSnapshot] = useState<BriefEvent | null>(null)
  const generation = useRef(0), mutation = useRef<{ key: string; id: string } | null>(null)
  const selection = useRef(0)
  const requestId = (key: string) => { if (mutation.current?.key !== key) mutation.current = { key, id: crypto.randomUUID() }; return mutation.current.id }
  const refresh = useCallback(async () => {
    if (!api) return
    const current = generation.current
    const a = await api.access(), all: ProductionBrief[] = []
    let after: string | undefined
    do { const p = await api.list(after); all.push(...p.items); after = p.nextCursor ?? undefined } while (after)
    if (current === generation.current) { setAccess(a); setBriefs(all) }
  }, [api])
  useEffect(() => {
    const effectGeneration = ++generation.current; selection.current++; setSelected(null); setAccess(null); setBriefs([]); setError(''); setNotice(''); setDirty(false); setLoading(true)
    let active = true
    refresh().then(async () => { const id = new URLSearchParams(window.location.search).get('brief'); if (id && api) { const b = await api.get(id); if (active) accept(b) } }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; generation.current = effectGeneration + 1 }
  }, [refresh,api])
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload) }, [dirty])
  const mayLeave = () => !dirty || window.confirm('Discard unsaved changes to this brief?')
  const accept = (brief: ProductionBrief) => { setSelected(brief); setForm(structuredClone(brief.data)); setDirty(false); setSnapshot(null) }
  const open = async (id: string) => {
    if (!api || !mayLeave() || busy) return
    const n = ++selection.current, g = generation.current
    setError(''); setBusy(true)
    try { const b = await api.get(id); if (n === selection.current && g === generation.current) accept(b) } catch (e) { if (g === generation.current) setError(errorText(e)) } finally { if (g === generation.current) setBusy(false) }
  }
  const run = async (task: (client: ProductionClient) => Promise<ProductionBrief | void>) => {
    if (!api || busy) return
    const g = generation.current
    setBusy(true); setError(''); setNotice('')
    try { const b = await task(api); if (g !== generation.current) return; if (b) accept(b); mutation.current = null; setNotice('Saved.'); await refresh() }
    catch (e) { if (g === generation.current) setError(errorText(e)) } finally { if (g === generation.current) setBusy(false) }
  }
  const save = () => selected && run(client => client.save(selected.id, form, selected.version, requestId(JSON.stringify({ save: selected.id, version: selected.version, form }))))
  const action = (command: Omit<BriefCommand, 'version' | 'requestId'>) => selected && run(client => client.action(selected.id, { ...command, version: selected.version, requestId: requestId(JSON.stringify({ id: selected.id, version: selected.version, command })) }))
  const update = (key: keyof BriefData, value: string | string[]) => { setForm(f => ({ ...f, [key]: value })); setDirty(true) }
  const updateField = (key: string, value: string) => { setForm(f => ({ ...f, fields: { ...f.fields, [key]: value } })); setDirty(true) }
  const editable = selected?.ownerId === access?.userId && ['draft','changes_requested'].includes(selected?.status ?? '')
  const missing = submissionErrors(form)
  const filtered = briefs.filter(b => (filter === 'all' || b.status === filter) && `${b.data.projectName} ${b.data.client} ${b.ownerName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  const loadMembers = useCallback(async (): Promise<ApiMember[]> => {
    if (preview) return previewPeople.map(p => ({ ...p, email: null, role: p.id === 'preview-admin' ? 'admin' : 'member', status: 'active' })) as ApiMember[]
    const people: ApiMember[] = []; let after: string | undefined
    do { const p = await database!.members(organizationId, { limit: 100, after }); people.push(...p.items); after = p.nextCursor ?? undefined } while (after)
    return people.filter(p => p.status === 'active')
  }, [preview,database,organizationId])
  const selectView = (next: typeof tab) => { if (mayLeave()) { setTab(next); setSelected(null); setDirty(false); setSnapshot(null) } }
  return <main className="production-page">
    <header className="production-heading"><div><p className="production-eyebrow">Production workspace</p><h1>Briefs & production</h1><p>Plan the work, review the brief, and confirm the shoot.</p></div><div className="production-context">
      {preview ? <label>Preview as<select value={person} disabled={busy} onChange={e => { if (mayLeave()) setPerson(e.target.value) }}>{previewPeople.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label> : <label>Organization<select disabled={busy} value={organizationId} onChange={e => { if (mayLeave()) setOrganizationId(e.target.value) }}>{session.organizations?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
    </div></header>
    {preview && <p className="production-info">Local preview. Changes stay in this browser.</p>}
    {configurationError && <p role="alert" className="production-error">{configurationError}</p>}
    <nav className="production-tabs" aria-label="Production views">{(['briefs','calendar', ...(access?.canAdminister ? ['settings'] : [])] as const).map(t => <button key={t} disabled={busy} aria-current={tab === t ? 'page' : undefined} onClick={() => selectView(t as typeof tab)}>{({ briefs: 'Briefs', calendar: 'Production calendar', decisions: 'Decisions & delivery', settings: 'Production access' } as Record<string,string>)[t]}</button>)}</nav>
    <div className="production-feedback" aria-live="polite">{error && <p role="alert" className="production-error">{error} <button disabled={busy} onClick={() => { if (mayLeave()) void (selected ? open(selected.id) : run(async () => { await refresh() })) }}>Reload</button></p>}{notice && <p role="status">{notice}</p>}</div>
    {loading ? <p role="status">Loading production workspace…</p> : !api || !access ? null : tab === 'settings' ? <ProductionSettingsForm key={organizationId + person} api={api} loadMembers={loadMembers} onSaved={refresh} /> : <>
      {!selected && (tab === 'calendar' ? <ProductionCalendar briefs={briefs} onOpen={id => void open(id)} /> : <>
        <div className="production-toolbar"><label className="production-search">Search briefs<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Project, client, or author" /></label><label>Status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="production-primary" disabled={busy} onClick={() => { if (mayLeave()) void run(client => client.create(emptyBrief(), requestId('create'))) }}>New brief <span aria-hidden="true">↗</span></button></div>
        <div className="production-table-wrap"><table className="production-table"><thead><tr><th>Project / client</th><th>Status</th><th>Requested by</th><th>Shoot</th><th>Delivery</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{filtered.map(b => <tr key={b.id}><td><button className="production-row-title" disabled={busy} onClick={() => void open(b.id)}>{b.data.projectName || 'Untitled brief'}</button><span>{b.data.client || 'Client not added'}</span></td><td><span className={`production-status status-${b.status}`}>{statusLabels[b.status]}</span></td><td>{b.ownerName}</td><td>{b.shootStartsAt ? dateLabel(b.shootStartsAt) : b.data.fields.proposedStart ? `${dateLabel(b.data.fields.proposedStart)} · tentative` : b.data.fields.shootEstimate || 'Not proposed'}</td><td>{b.data.deliveryDate ? dateLabel(b.data.deliveryDate) : 'Not set'}</td><td><button disabled={busy} aria-label={`Open ${b.data.projectName || 'untitled brief'}`} onClick={() => void open(b.id)}>↗</button></td></tr>)}</tbody></table>{!filtered.length && <div className="production-empty"><h2>{briefs.length ? 'No matching briefs' : 'Start with a brief'}</h2><p>{briefs.length ? 'Try another search or status.' : 'Create a production request to share the scope, dates, and deliverables with Production leadership.'}</p></div>}</div>
      </>)}
      {selected && <div className="production-detail"><div className="production-detail-header"><button disabled={busy} onClick={() => { if (mayLeave()) { setSelected(null); setDirty(false) } }}>← Back to {tab === 'calendar' ? 'calendar' : 'briefs'}</button><span className={`production-status status-${selected.status}`}>{statusLabels[selected.status]}</span><span>Revision {selected.version} · Submission {selected.submission}</span><button disabled={busy} onClick={() => window.print()}>Print / save PDF</button></div>
        <div className="production-detail-grid"><div>
          <form className="production-form" onSubmit={e => { e.preventDefault(); void save() }}>
            <h2>{selected.data.projectName || 'New production brief'}</h2><p className="production-muted">Created by {selected.ownerName} · {new Date(selected.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</p>
            <fieldset disabled={!editable || busy}><legend>Request details</legend><div className="production-fields">
              {(['projectName','client','managers','supervisor','deliveryDate'] as const).map(key => <label key={key}>{({ projectName: 'Project name *', client: 'Client *', managers: 'Account / project managers *', supervisor: 'Production supervisor', deliveryDate: 'Target delivery date *' })[key]}<input maxLength={key === 'managers' ? 500 : 160} type={key === 'deliveryDate' ? 'date' : 'text'} value={form[key]} onChange={e => update(key,e.target.value)} /></label>)}
            </div><div className="production-type-options"><span>Production type *</span>{productionTypes.map(t => <label key={t}><input type="checkbox" checked={form.productionTypes.includes(t)} onChange={e => update('productionTypes', e.target.checked ? [...form.productionTypes,t] : form.productionTypes.filter(v => v !== t))} />{t}</label>)}</div></fieldset>
            {visibleSections(form).map(s => <fieldset key={s.title} disabled={!editable || busy}><legend>{s.title}</legend><div className="production-fields">{s.fields.map(f => <label className={f.type === 'textarea' ? 'production-wide' : undefined} key={f.key}>{f.label}{f.required ? ' *' : ''}{f.type === 'textarea' ? <textarea rows={3} maxLength={6000} value={form.fields[f.key] ?? ''} onChange={e => updateField(f.key,e.target.value)} /> : f.type === 'select' ? <select value={form.fields[f.key] ?? ''} onChange={e => updateField(f.key,e.target.value)}><option value="">Choose…</option>{f.options?.map(v => <option key={v}>{v}</option>)}</select> : <input type={f.type ?? 'text'} maxLength={1000} value={form.fields[f.key] ?? ''} onChange={e => updateField(f.key,e.target.value)} />}</label>)}</div></fieldset>)}
            {editable && <div className="production-savebar"><span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="production-primary" disabled={busy || !dirty} type="submit">{busy ? 'Saving…' : 'Save draft'}</button></div>}
          </form>
          <article className="production-print"><h2>{selected.data.projectName || 'Production brief'}</h2><p>{selected.data.client} · {statusLabels[selected.status]} · Revision {selected.version}</p><p>Requested by {selected.ownerName} · Managers: {selected.data.managers} · Production supervisor: {selected.data.supervisor || 'Not assigned'}</p><p>Delivery: {selected.data.deliveryDate || 'Not set'} · Production: {selected.data.productionTypes.join(', ')}</p>{selected.shootStartsAt && <p>Confirmed shoot: {dateLabel(selected.shootStartsAt)} – {dateLabel(new Date(Date.parse(selected.shootEndsAt!) - 1).toISOString())}</p>}{visibleSections(selected.data).map(s => <section key={s.title}><h3>{s.title}</h3><dl>{s.fields.filter(f=>selected.data.fields[f.key]).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{selected.data.fields[f.key]}</dd></div>)}</dl></section>)}</article>
          <section className="production-attachments"><h3>Attachments</h3><p>Private PDFs and images, up to 20 MiB each. Asset and reference links can also be included in the brief.</p><ul>{selected.attachments.map(a => <li key={a.id}><span>{a.name} · {Math.ceil(a.size / 1024)} KB · {a.status}</span>{a.status === 'ready' ? <><button disabled={busy} onClick={() => void run(async client => { const download = await client.download(selected.id,a.id); const link = document.createElement('a'); link.href = download.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click() })}>Download</button>{editable && <button disabled={busy || dirty} onClick={() => { if (window.confirm('Remove this attachment from the current brief? Submitted revisions retain their attachment history.')) void run(async client => { await client.discard(selected.id,a.id); return client.get(selected.id) }) }}>Remove attachment</button>}</> : editable && <><button disabled={busy} onClick={() => void run(client => client.complete(selected.id,a.id))}>Finish upload</button><button disabled={busy} onClick={() => void run(async client => { await client.discard(selected.id,a.id); return client.get(selected.id) })}>Remove attachment</button></>}</li>)}</ul>
            {editable && !preview && <label className="production-upload">Add attachment<input type="file" disabled={busy || dirty} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024) { setError('Use a PDF, JPEG, PNG or WebP up to 20 MiB.'); return }
              const id = crypto.randomUUID(); void run(async client => { const upload = await client.attach(selected.id, { id, name: file.name, contentType: file.type, size: file.size }); const body = new FormData(); Object.entries(upload.fields).forEach(([key,value]) => body.append(key,value)); body.append('file',file); const response = await fetch(upload.url, { method: 'POST', body, credentials: 'omit' }); if (!response.ok) throw new Error('Upload failed. Reload to discard the pending upload and try again.'); return client.complete(selected.id,id) })
            }} /></label>}{dirty && editable && <p>Save changes before uploading attachments.</p>}
          </section>
        </div><aside className="production-inspector">
          <ReviewPanel brief={selected} access={access} busy={busy} dirty={dirty} missing={missing} onAction={action} />
          <section className="production-history"><h3>Activity & revisions</h3>{[...selected.events].reverse().map(e => <article key={e.id}><div><strong>{e.kind.replaceAll('_',' ')}</strong><small>{new Date(e.createdAt).toLocaleString()}</small></div><p>{e.actorName}{e.section ? ` · ${e.section}` : ''}</p>{e.comment && <blockquote>{e.comment}</blockquote>}{e.snapshot && <button onClick={() => setSnapshot(e)}>View revision {e.version}</button>}</article>)}</section>
        </aside></div>
        {snapshot && <section className="production-snapshot" aria-label="Submission snapshot"><div><h3>Recorded revision {snapshot.version}</h3><button onClick={() => setSnapshot(null)}>Close snapshot</button></div><p>This preserves the brief at this point in its review history.</p><dl>{Object.entries(snapshot.snapshot!).filter(([k]) => !['fields','productionTypes'].includes(k)).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}<div><dt>Production types</dt><dd>{snapshot.snapshot!.productionTypes.join(', ')}</dd></div>{briefSections.flatMap(s => s.fields).filter(f => snapshot.snapshot!.fields[f.key]).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{snapshot.snapshot!.fields[f.key]}</dd></div>)}</dl>{snapshot.attachments?.map(a => <button key={a.id} disabled={busy} onClick={() => void run(async client => { const file = await client.download(selected.id,a.id); const link = document.createElement('a'); link.href = file.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click() })}>Download {a.name}</button>)}</section>}
      </div>}
    </>}
  </main>
}
function ReviewPanel({ brief, access, busy, dirty, missing, onAction }: { brief: ProductionBrief; access: ProductionAccess; busy: boolean; dirty: boolean; missing: string[]; onAction: (command: Omit<BriefCommand,'version'|'requestId'>) => unknown }) {
  const [comment,setComment] = useState(''), [section,setSection] = useState(''), [start,setStart] = useState(''), [end,setEnd] = useState('')
  useEffect(() => { setComment(''); setSection(''); setStart(''); setEnd('') }, [brief.id,brief.version])
  const own = brief.ownerId === access.userId, editable = own && ['draft','changes_requested'].includes(brief.status)
  const send = (action: BriefCommand['action']) => onAction({ action, comment, section, ...(['approve','schedule'].includes(action) && (start || end) ? { shootStartsAt: start ? `${start}T00:00:00.000Z` : '', shootEndsAt: end ? new Date(Date.parse(end) + 86400_000).toISOString() : '' } : {}) })
  return <section className="production-review"><h3>Review & scheduling</h3><p>{brief.shootStartsAt ? `Confirmed shoot: ${dateLabel(brief.shootStartsAt)} – ${dateLabel(new Date(Date.parse(brief.shootEndsAt!) - 1).toISOString())}` : 'Shoot dates become confirmed when Production approves the brief.'}</p>
    {editable && <><p>{missing.length ? `Before submitting: ${missing.join(', ')}.` : 'Required details are complete.'}</p><button className="production-primary" disabled={busy || dirty || missing.length > 0 || brief.attachments.some(a => a.status === 'pending')} onClick={() => send('submit')}>Submit for review</button>{dirty && <small>Save the draft before submitting.</small>}</>}
    {(own || access.canReview) && !['denied','withdrawn'].includes(brief.status) && <><label>Comment / decision reason<textarea rows={4} maxLength={6000} value={comment} disabled={busy} onChange={e => setComment(e.target.value)} /></label><label>Brief section<select value={section} disabled={busy} onChange={e => setSection(e.target.value)}><option value="">Whole brief</option>{briefSections.map(s => <option key={s.title}>{s.title}</option>)}</select></label><button disabled={busy || dirty || !comment.trim()} onClick={() => send('comment')}>Add comment</button></>}
    {access.canReview && ['submitted','approved'].includes(brief.status) && <><div className="production-review-dates"><p>{brief.data.fields.proposedStart ? `Proposed: ${brief.data.fields.proposedStart} – ${brief.data.fields.proposedEnd}.` : 'No concrete shoot dates proposed.'} Enter dates below to confirm a different window.</p><label>Confirmed shoot starts<input type="date" disabled={busy} value={start} onChange={e => setStart(e.target.value)} /></label><label>Confirmed shoot ends<input type="date" disabled={busy} value={end} onChange={e => setEnd(e.target.value)} /></label></div><div className="production-review-actions">
      {brief.status === 'submitted' && <><button className="production-primary" disabled={busy || dirty} onClick={() => send('approve')}>Approve & confirm dates</button><button className="production-danger" disabled={busy || dirty || !comment.trim()} onClick={() => { if (window.confirm('Deny this production request? Your reason will be recorded.')) send('deny') }}>Deny brief</button></>}
      <button disabled={busy || dirty || !comment.trim()} onClick={() => send('request_changes')}>Request changes</button>{brief.status === 'approved' && <button disabled={busy || dirty || !start || !end} onClick={() => send('schedule')}>Update confirmed dates</button>}
    </div></>}
    {(own || access.canReview) && ['submitted','approved','changes_requested'].includes(brief.status) && <button disabled={busy || dirty} className="production-danger" onClick={() => { if (window.confirm('Withdraw this request and remove any confirmed shoot from the calendar?')) send('withdraw') }}>Withdraw request</button>}
    {own && ['denied','withdrawn'].includes(brief.status) && <button disabled={busy} onClick={() => send('reopen')}>Reopen as draft</button>}
  </section>
}
function ProductionSettingsForm({ api, loadMembers, onSaved }: { api: ProductionClient; loadMembers: () => Promise<ApiMember[]>; onSaved: () => Promise<void> }) {
  const [settings,setSettings] = useState<ProductionSettings | null>(null), [members,setMembers] = useState<ApiMember[]>([]), [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState('')
  useEffect(() => { let active = true; Promise.all([api.settings(),loadMembers()]).then(([s,m]) => { if (active) { setSettings(s); setMembers(m) } }).catch(e => { if (active) setError(errorText(e)) }); return () => { active = false } }, [api,loadMembers])
  return <section className="production-settings"><h2>Production access</h2><p>Organization administrators manage access. Production leadership reviews requests; the Executive Leadership Team can read submitted briefs and decisions.</p>{error && <p role="alert" className="production-error">{error}</p>}{message && <p role="status">{message}</p>}{!settings ? <p>Loading settings…</p> : <form onSubmit={e => { e.preventDefault(); setBusy(true); setMessage(''); setError(''); api.saveSettings({ ...settings, approvalConfirmsDates: true }).then(async s => { setSettings(s); setMessage('Production access settings saved.'); await onSaved() }).catch(e => setError(errorText(e))).finally(() => setBusy(false)) }}>
    <fieldset disabled={busy}><legend>Team access</legend><table className="production-table"><thead><tr><th>Active member</th><th>Production leadership</th><th>Executive Leadership Team</th></tr></thead><tbody>{members.map(m => <tr key={m.id}><td>{m.displayName || m.email || m.id}<span>{m.email}</span></td>{(['reviewerIds','executiveIds'] as const).map(key => <td key={key}><input aria-label={`${key === 'reviewerIds' ? 'Production leadership' : 'Executive Leadership Team'}: ${m.displayName || m.email || m.id}`} type="checkbox" checked={settings[key].includes(m.id)} onChange={e => setSettings(s => s ? { ...s, [key]: e.target.checked ? [...s[key],m.id] : s[key].filter(id => id !== m.id) } : s)} /></td>)}</tr>)}</tbody></table>{!members.length && <p>No active members are available.</p>}</fieldset>
    <p>Approval confirms proposed shoot dates. A month-only estimate needs concrete dates before approval. Equipment bookings are managed separately.</p><button className="production-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
  </form>}</section>
}
