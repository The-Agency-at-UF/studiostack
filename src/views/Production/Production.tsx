'use client'
import { PageHeader, WorkspaceTabs, Field, TableRegion, DetailPanel, Skeleton } from '../../components/workspace/WorkspaceUI'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useAppSession } from '../../context/AppSessionContext'
import { createDatabaseApiClient, DatabaseApiClientError } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import { createPreviewProductionClient, previewPeople } from '../../production/preview'
import { briefSections, emptyBrief, productionTypes, statusLabels, submissionErrors, visibleSections, type BriefCommand, type BriefData, type BriefEvent, type Delivery, type ProductionAccess, type ProductionBrief, type ProductionSettings } from '../../types/production'
import type { ApiMember } from '../../types/database-api'
import type { ProductionClient } from '../../api/production'
import ClientAccounts from './ClientAccounts'
import ProductionCrew from './ProductionCrew'
import type {ClientAccount} from '../../types/production'
import EmailVerification from './EmailVerification'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import './Production.css'
const ProductionCalendar = dynamic(() => import('./ProductionCalendar'), { ssr: false, loading: () => <p role="status">Loading calendar…</p> })
const errorText = (error: unknown) => error instanceof DatabaseApiClientError ? ({
  400: 'Check the required fields, dates and review reason.',
  401: 'Your session expired. Sign in again.',
  403: 'Your account does not have permission for this action.',
  404: 'This record is unavailable.',
  409: 'This record changed or the action conflicts with its status. Reload before trying again.',
  429: 'Too many requests. Please wait a moment before trying again.',
  502: 'Production gateway received an invalid response. Please try again.',
  503: 'Production services are unavailable. Your unsaved work is still here.',
  504: 'The database request timed out while connecting. Please try again.'
}[error.status] ?? 'The request failed. Try again.') : error instanceof TypeError && /fetch|network/i.test(error.message) ? 'Network connection error. Check your connection.' : error instanceof Error ? error.message : 'Something went wrong. Try again.'
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
type CachedProduction = { briefs: ProductionBrief[]; access: ProductionAccess | null; clients: ClientAccount[]; deliveries: Delivery[] }
export default function Production() {
  const session = useAppSession(), preview = session.mode === 'preview'
  const {organizations,selectedOrganizationId,setSelectedOrganizationId} = session
  const [organizationId, setOrganizationId] = useState(session.selectedOrganizationId??session.organizations?.[0]?.id ?? '')
  const appliedOrganizationLink=useRef(false)
  useEffect(() => { const id = appliedOrganizationLink.current?null:new URLSearchParams(window.location.search).get('organization');appliedOrganizationLink.current=true; if (id && organizations?.some(o => o.id === id)) {setOrganizationId(id);setSelectedOrganizationId?.(id)} else if(selectedOrganizationId)setOrganizationId(selectedOrganizationId) }, [organizations,selectedOrganizationId,setSelectedOrganizationId])
  const [person, setPerson] = useState('preview-author')
  const { api, error: configurationError } = useProductionClient(organizationId, person)
  const cacheKey = `production:${organizationId}${preview ? ':' + person : ''}`
  // Read the initial snapshot only when the workspace changes. Cache writes
  // must not recreate refresh and restart its loading effect.
  const cached = useMemo(() => getCached<CachedProduction>(cacheKey), [cacheKey])
  const [briefs, setBriefs] = useState<ProductionBrief[]>(cached?.briefs ?? []), [access, setAccess] = useState<ProductionAccess | null>(cached?.access ?? null)
  const [selected, setSelected] = useState<ProductionBrief | null>(null), [form, setForm] = useState<BriefData>(emptyBrief)
  const [tab, setTab] = useState<'briefs' | 'calendar' | 'decisions' | 'settings' | 'clients'>('briefs')
  const [clients,setClients]=useState<ClientAccount[]>(cached?.clients ?? []),[clientFilter,setClientFilter]=useState('')
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(!cached), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [deliveries, setDeliveries] = useState<Delivery[]>(cached?.deliveries ?? [])
  const [dirty, setDirty] = useState(false), [snapshot, setSnapshot] = useState<BriefEvent | null>(null)
  const generation = useRef(0), mutation = useRef<{ key: string; id: string } | null>(null)
  const selection = useRef(0)
  const requestId = (key: string) => { if (mutation.current?.key !== key) mutation.current = { key, id: crypto.randomUUID() }; return mutation.current.id }
  const refresh = useCallback(async () => {
    if (!api) return
    const current = generation.current
    const a = await api.access()
    if (current !== generation.current) return
    setAccess(a)

    const [briefsRes, deliveriesRes, clientsRes] = await Promise.allSettled([
      (async () => {
        const all: ProductionBrief[] = []
        let after: string | undefined
        do { const p = await api.list(after); all.push(...p.items); after = p.nextCursor ?? undefined } while (after)
        return all
      })(),
      (async () => {
        if (!a.canAdminister && !a.canReview && !a.isExecutive) return []
        const outbox: Delivery[] = []
        let after: string | undefined
        do { const p = await api.deliveries(after); outbox.push(...p.items); after = p.nextCursor ?? undefined } while (after)
        return outbox
      })(),
      (async () => {
        const accounts: ClientAccount[] = []
        let after: string | undefined
        do { const p = await api.clients(after); accounts.push(...p.items); after = p.nextCursor ?? undefined } while (after)
        return accounts
      })()
    ])

    if (current !== generation.current) return
    if (briefsRes.status === 'fulfilled') setBriefs(briefsRes.value)
    else setError(errorText(briefsRes.reason))
    if (deliveriesRes.status === 'fulfilled') setDeliveries(deliveriesRes.value)
    if (clientsRes.status === 'fulfilled') setClients(clientsRes.value)
    if (briefsRes.status === 'fulfilled') {
      setCached(cacheKey, {
        briefs: briefsRes.value,
        access: a,
        clients: clientsRes.status === 'fulfilled' ? clientsRes.value : (cached?.clients ?? []),
        deliveries: deliveriesRes.status === 'fulfilled' ? deliveriesRes.value : (cached?.deliveries ?? [])
      })
    }
  }, [api, cacheKey, cached])
  useEffect(() => {
    const effectGeneration = ++generation.current; selection.current++; setSelected(null); setError(''); setNotice(''); setDirty(false)
    setBriefs(cached?.briefs ?? []); setAccess(cached?.access ?? null); setClients(cached?.clients ?? []); setDeliveries(cached?.deliveries ?? [])
    setLoading(!cached)
    let active = true
    refresh().then(async () => { const id = new URLSearchParams(window.location.search).get('brief'); if (id && api) { const b = await api.get(id); if (active) accept(b) } }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; generation.current = effectGeneration + 1 }
  }, [refresh,api,cached])
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload) }, [dirty])
  useEffect(() => {
    if (!dirty) return
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return
      const next = new URL(target.href, window.location.href)
      if (next.origin === window.location.origin && next.pathname === window.location.pathname && next.search === window.location.search) return
      if (!window.confirm('Discard unsaved changes to this brief?')) { event.preventDefault(); event.stopPropagation() }
    }
    document.addEventListener('click', guardNavigation, true)
    return () => document.removeEventListener('click', guardNavigation, true)
  }, [dirty])
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
    try { const b = await task(api); if (g !== generation.current) return; if (b) accept(b); mutation.current = null; setNotice('Saved.'); invalidateCache(cacheKey); await refresh() }
    catch (e) { if (g === generation.current) setError(errorText(e)) } finally { if (g === generation.current) setBusy(false) }
  }
  const save = () => selected && run(client => client.save(selected.id, form, selected.version, requestId(JSON.stringify({ save: selected.id, version: selected.version, form }))))
  const action = (command: Omit<BriefCommand, 'version' | 'requestId'>) => selected && run(client => client.action(selected.id, { ...command, version: selected.version, requestId: requestId(JSON.stringify({ id: selected.id, version: selected.version, command })) }))
  const update = (key: keyof BriefData, value: string | string[]) => { setForm(f => ({ ...f, [key]: value })); setDirty(true) }
  const updateField = (key: string, value: string) => { setForm(f => ({ ...f, fields: { ...f.fields, [key]: value } })); setDirty(true) }
  const editable = selected?.ownerId === access?.userId && ['draft','changes_requested'].includes(selected?.status ?? '')
  const missing = submissionErrors(form)
  const byClient=briefs.filter(b=>!clientFilter||(b.data.clientAccountId??b.data.client)===clientFilter)
  const filtered = byClient.filter(b => (filter === 'all' || b.status === filter) && `${b.data.projectName} ${b.data.client} ${b.ownerName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  const loadMembers = useCallback(async (): Promise<ApiMember[]> => {
    if (preview) return previewPeople.map(p => ({ ...p, email: null, role: p.id === 'preview-admin' ? 'admin' : 'member', status: 'active' })) as ApiMember[]
    const people: ApiMember[] = []; let after: string | undefined
    do { const p = await api!.people(after); people.push(...p.items); after = p.nextCursor ?? undefined } while (after)
    return people.filter(p => p.status === 'active')
  }, [preview,api])
  const selectView = (next: typeof tab) => { if (mayLeave()) { setTab(next); setSelected(null); setDirty(false); setSnapshot(null) } }
  return <main className="production-page">
    <PageHeader title="Briefs & production" context="Production workspace" description="Plan the work, review the brief, and confirm the shoot." actions={<><div className="production-context">
      {preview ? <label>Preview as<select value={person} disabled={busy} onChange={e => { if (mayLeave()) setPerson(e.target.value) }}>{previewPeople.map(p => <option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label> : <label>Organization<select disabled={busy} value={organizationId} onChange={e => { if (mayLeave()) {setOrganizationId(e.target.value);session.setSelectedOrganizationId?.(e.target.value)} }}>{session.organizations?.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
    </div>{!selected&&tab==='briefs'&&<button className="production-primary" disabled={busy||!api||!access} onClick={() => { if (mayLeave()) void run(client => client.create(emptyBrief(), requestId('create'))) }}>New brief</button>}</>}/>

    {preview && <p className="production-info">Local preview. Changes stay in this browser; attachments and email delivery require sign-in.</p>}
    {!preview && session.getAccessToken && <EmailVerification getAccessToken={session.getAccessToken} />}
    {configurationError && <p role="alert" className="production-error">{configurationError}</p>}
    <WorkspaceTabs label="Production views" active={tab} disabled={busy} items={(['briefs','calendar','clients', ...(access?.isExecutive || access?.canReview || access?.canAdminister ? ['decisions'] : []), ...(access?.canAdminister ? ['settings'] : [])]).map(value=>({value,label:({ clients:'Client accounts',briefs:'Briefs',calendar:'Production calendar',decisions:'Decisions & delivery',settings:'Access & notifications' } as Record<string,string>)[value]}))} onChange={value=>selectView(value as typeof tab)}/>
    <div className="production-feedback" aria-live="polite">{error && <p role="alert" className="production-error">{error} <button disabled={busy} onClick={() => { if (mayLeave()) void (selected ? open(selected.id) : run(async () => { await refresh() })) }}>Reload</button></p>}{notice && <p role="status">{notice}</p>}</div>
    {loading ? <Skeleton label="Loading production workspace…" variant="row" count={5} /> : !api ? null : !access ? (
      <div className="production-empty">
        <h2>Production workspace unavailable</h2>
        <p>The production workspace could not be loaded. Check your connection or try again.</p>
        <button className="production-primary" disabled={busy} onClick={() => void refresh()}>Retry loading workspace</button>
      </div>
    ) : tab === 'clients' ? <ClientAccounts key={organizationId+person} clients={clients} api={api} canManage={access.canReview&&!preview} onRefresh={refresh}/> : tab === 'settings' ? <ProductionSettingsForm key={organizationId + person} api={api} loadMembers={loadMembers} onSaved={refresh} /> : tab === 'decisions' ? <DecisionFeed api={api} briefs={briefs} deliveries={deliveries} access={access} preview={preview} onOpen={id => { setTab('briefs'); void open(id) }} onRefresh={refresh} /> : <>
      {!selected&&tab==='calendar'&&<Field className="production-client-filter" label="Client account"><select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="">All client accounts</option>{[...new Map(briefs.filter(b=>b.data.client).map(b=>[b.data.clientAccountId??b.data.client,b.data.client])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>}
      {!selected && (tab === 'calendar' ? <ProductionCalendar key={organizationId+person} viewKey={organizationId+person} briefs={byClient} onOpen={id => void open(id)} /> : <>
        <div className="production-toolbar"><Field className="production-client-filter" label="Client account"><select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="">All client accounts</option>{[...new Map(briefs.filter(b=>b.data.client).map(b=>[b.data.clientAccountId??b.data.client,b.data.client])).entries()].map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field><Field className="production-search" label="Search briefs"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Project, client, or author" /></Field><label>Status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className="production-filter-summary" aria-live="polite"><span>{filtered.length} {filtered.length===1?'brief':'briefs'}{query||filter!=='all'||clientFilter?' · Filters applied':''}</span>{(query||filter!=='all'||clientFilter)&&<button onClick={()=>{setQuery('');setFilter('all');setClientFilter('')}}>Clear filters</button>}</div>
        <TableRegion className="production-table-wrap" label="Production briefs"><table className="production-table"><thead><tr><th>Project / client</th><th>Status</th><th>Requested by</th><th>Shoot</th><th>Delivery</th><th><span className="sr-only">Open</span></th></tr></thead><tbody className="ws-stagger">{filtered.map(b => <tr key={b.id}><td><button className="production-row-title" disabled={busy} onClick={() => void open(b.id)}>{b.data.projectName || 'Untitled brief'}</button><span>{b.data.client || 'Client not added'}</span></td><td><span className={`production-status status-${b.status}`}>{statusLabels[b.status]}</span></td><td>{b.ownerName}</td><td>{b.shootStartsAt ? dateLabel(b.shootStartsAt) : b.data.fields.proposedStart ? `${dateLabel(b.data.fields.proposedStart)} · tentative` : b.data.fields.shootEstimate || 'Not proposed'}</td><td>{b.data.deliveryDate ? dateLabel(b.data.deliveryDate) : 'Not set'}</td><td><button disabled={busy} aria-label={`Open ${b.data.projectName || 'untitled brief'}`} onClick={() => void open(b.id)}>↗</button></td></tr>)}</tbody></table>{!filtered.length && <div className="production-empty"><h2>{briefs.length ? 'No matching briefs' : 'Start with a brief'}</h2><p>{briefs.length ? 'Try another search or status.' : 'Create a production request to share the scope, dates, and deliverables with Production leadership.'}</p></div>}</TableRegion>
      </>)}
      {selected && <div className="production-detail ws-enter"><div className="production-detail-header"><button disabled={busy} onClick={() => { if (mayLeave()) { setSelected(null); setDirty(false) } }}>← Back to {tab === 'calendar' ? 'calendar' : 'briefs'}</button><span className={`production-status status-${selected.status}`}>{statusLabels[selected.status]}</span><span>Revision {selected.version} · Submission {selected.submission}</span><button disabled={busy} onClick={() => window.print()}>Print / save PDF</button></div>
        <div className="production-detail-grid"><div>
          <nav className="production-section-nav" aria-label="Brief sections"><a href="#brief-request">Request details</a>{visibleSections(form).map(section=><a key={section.title} href={`#brief-${section.title.toLowerCase().replaceAll(' ','-')}`}>{section.title}</a>)}<a href="#brief-crew">Crew</a><a href="#brief-attachments">Attachments</a></nav>
          <form className="production-form" onSubmit={e => { e.preventDefault(); void save() }}>
            <h2>{selected.data.projectName || 'New production brief'}</h2><p className="production-muted">Created by {selected.ownerName} · {new Date(selected.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</p>
            <fieldset id="brief-request" disabled={!editable || busy}><legend>Request details</legend><div className="production-fields">
              <label>Client account<select value={form.clientAccountId??''} onChange={e=>{const c=clients.find(c=>c.id===e.target.value);setForm(f=>({...f,clientAccountId:c?.id??null,client:c?.name??f.client}));setDirty(true)}}><option value="">Choose an account or enter a client below</option>{clients.filter(c=>!c.archivedAt||c.id===form.clientAccountId).map(c=><option key={c.id} value={c.id}>{c.name}{c.archivedAt?' · Archived':''}</option>)}</select></label>
              {(['projectName','client','managers','supervisor','deliveryDate'] as const).map(key => <label key={key}>{({ projectName: 'Project name *', client: 'Client *', managers: 'Account / project managers *', supervisor: 'Production supervisor', deliveryDate: 'Target delivery date *' })[key]}<input maxLength={key === 'managers' ? 500 : 160} type={key === 'deliveryDate' ? 'date' : 'text'} readOnly={key==='client'&&Boolean(form.clientAccountId)} value={form[key]} onChange={e => update(key,e.target.value)} /></label>)}
            </div><div className="production-type-options"><span>Production type *</span>{productionTypes.map(t => <label key={t}><input type="checkbox" checked={form.productionTypes.includes(t)} onChange={e => update('productionTypes', e.target.checked ? [...form.productionTypes,t] : form.productionTypes.filter(v => v !== t))} />{t}</label>)}</div></fieldset>
            {visibleSections(form).map(s => <fieldset id={`brief-${s.title.toLowerCase().replaceAll(' ','-')}`} key={s.title} disabled={!editable || busy}><legend>{s.title}</legend><div className="production-fields">{s.fields.map(f => <label className={f.type === 'textarea' ? 'production-wide' : undefined} key={f.key}>{f.label}{f.required ? ' *' : ''}{f.type === 'textarea' ? <textarea rows={3} maxLength={6000} value={form.fields[f.key] ?? ''} onChange={e => updateField(f.key,e.target.value)} /> : f.type === 'select' ? <select value={form.fields[f.key] ?? ''} onChange={e => updateField(f.key,e.target.value)}><option value="">Choose…</option>{f.options?.map(v => <option key={v}>{v}</option>)}</select> : <input type={f.type ?? 'text'} maxLength={1000} value={form.fields[f.key] ?? ''} onChange={e => updateField(f.key,e.target.value)} />}</label>)}</div></fieldset>)}
            {editable && <div className="production-savebar"><span>{dirty ? 'Unsaved changes' : 'All changes saved'}</span><button className="production-primary" disabled={busy || !dirty} type="submit">{busy ? 'Saving…' : 'Save draft'}</button></div>}
          </form>
          <div id="brief-crew"><ProductionCrew key={`${selected.id}:${selected.version}`} brief={selected} canAssign={access.canReview&&!preview} disabled={busy||dirty} loadMembers={loadMembers} onAssign={assignments=>run(client=>client.assign(selected.id,{assignments,version:selected.version,requestId:requestId(JSON.stringify({crew:selected.id,version:selected.version,assignments}))}))}/></div><article className="production-print"><h2>{selected.data.projectName || 'Production brief'}</h2><p>{selected.data.client} · {statusLabels[selected.status]} · Revision {selected.version}</p><p>Requested by {selected.ownerName} · Managers: {selected.data.managers} · Production supervisor: {selected.data.supervisor || 'Not assigned'}</p><p>Delivery: {selected.data.deliveryDate || 'Not set'} · Production: {selected.data.productionTypes.join(', ')}</p>{selected.shootStartsAt && <p>Confirmed shoot: {dateLabel(selected.shootStartsAt)} – {dateLabel(new Date(Date.parse(selected.shootEndsAt!) - 1).toISOString())}</p>}{visibleSections(selected.data).map(s => <section key={s.title}><h3>{s.title}</h3><dl>{s.fields.filter(f=>selected.data.fields[f.key]).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{selected.data.fields[f.key]}</dd></div>)}</dl></section>)}</article>
          <section id="brief-attachments" className="production-attachments"><h3>Attachments</h3><p>Private PDFs and images, up to 20 MiB each. Asset and reference links can also be included in the brief.</p><ul>{selected.attachments.map(a => <li key={a.id}><span>{a.name} · {Math.ceil(a.size / 1024)} KB · {a.status}</span>{a.status === 'ready' ? <><button disabled={busy} onClick={() => void run(async client => { const download = await client.download(selected.id,a.id); const link = document.createElement('a'); link.href = download.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click() })}>Download</button>{editable && <button disabled={busy || dirty} onClick={() => { if (window.confirm('Remove this attachment from the current brief? Submitted revisions retain their attachment history.')) void run(async client => { await client.discard(selected.id,a.id); return client.get(selected.id) }) }}>Remove attachment</button>}</> : editable && <><button disabled={busy} onClick={() => void run(client => client.complete(selected.id,a.id))}>Finish upload</button><button disabled={busy} onClick={() => void run(async client => { await client.discard(selected.id,a.id); return client.get(selected.id) })}>Remove attachment</button></>}</li>)}</ul>
            {editable && !preview && <label className="production-upload">Add attachment<input type="file" disabled={busy || dirty} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024) { setError('Use a PDF, JPEG, PNG or WebP up to 20 MiB.'); return }
              const id = crypto.randomUUID(); void run(async client => { const upload = await client.attach(selected.id, { id, name: file.name, contentType: file.type, size: file.size }); const body = new FormData(); Object.entries(upload.fields).forEach(([key,value]) => body.append(key,value)); body.append('file',file); const response = await fetch(upload.url, { method: 'POST', body, credentials: 'omit' }); if (!response.ok) throw new Error('Upload failed. Reload to discard the pending upload and try again.'); return client.complete(selected.id,id) })
            }} /></label>}{dirty && editable && <p>Save changes before uploading attachments.</p>}
          </section>
        </div><DetailPanel className="production-inspector" label="Review and activity">
          <ReviewPanel brief={selected} access={access} busy={busy} dirty={dirty} missing={missing} onAction={action} />
          <section className="production-history"><h3>Activity & revisions</h3>{[...selected.events].reverse().map(e => <article key={e.id}><div><strong>{e.kind.replaceAll('_',' ')}</strong><small>{new Date(e.createdAt).toLocaleString()}</small></div><p>{e.actorName}{e.section ? ` · ${e.section}` : ''}</p>{e.comment && <blockquote>{e.comment}</blockquote>}{e.snapshot && <button onClick={() => setSnapshot(e)}>View revision {e.version}</button>}</article>)}</section>
        </DetailPanel></div>
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
    {!access.notificationsConfigured && <p className="production-warning">ELT decisions appear in this workspace. An administrator must assign ELT members, and the system’s email sender must be verified for automatic delivery.</p>}
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
  return <section className="production-settings"><h2>Access & notifications</h2><p>Organization administrators manage access. Production Leads and administrators review briefs and assign shoot crews; members can see shared production and bookings; the Executive Leadership Team can read submitted briefs and decisions.</p>{error && <p role="alert" className="production-error">{error}</p>}{message && <p role="status">{message}</p>}{!settings ? <p>Loading settings…</p> : <form onSubmit={e => { e.preventDefault(); setBusy(true); setMessage(''); setError(''); api.saveSettings({ ...settings, approvalConfirmsDates: true }).then(async s => { setSettings(s); setMessage('Production access and notification settings saved.'); await onSaved() }).catch(e => setError(errorText(e))).finally(() => setBusy(false)) }}>
    <p>Owners and administrators include Production Lead permissions. Select Production Lead for active teammates who can review, approve, confirm dates, request changes, deny briefs and view organization booking names and equipment. This does not grant organization administration or permission to change other members’ equipment bookings.</p><fieldset disabled={busy}><legend>Team access</legend><table className="production-table"><thead><tr><th>Active member</th><th>Production Lead</th><th>Executive Leadership Team</th></tr></thead><tbody>{members.map(m => <tr key={m.id}><td>{m.displayName || m.email || m.id}<span>{m.email}</span></td>{(['reviewerIds','executiveIds'] as const).map(key => <td key={key}><input aria-label={`${key === 'reviewerIds' ? 'Production leadership' : 'Executive Leadership Team'}: ${m.displayName || m.email || m.id}`} type="checkbox" disabled={key==='reviewerIds'&&['owner','admin'].includes(m.role)} checked={settings[key].includes(m.id)||(key==='reviewerIds'&&['owner','admin'].includes(m.role))} onChange={e => setSettings(s => s ? { ...s, [key]: e.target.checked ? [...s[key],m.id] : s[key].filter(id => id !== m.id) } : s)} /></td>)}</tr>)}</tbody></table>{!members.length && <p>No active members are available.</p>}</fieldset>
    <fieldset><legend>Decision emails</legend><p>Decisions notify the brief’s author and active Executive Leadership Team members at the verified email addresses on their sign-in accounts. No separate mailing list is needed. Sending starts after the system’s sender address is verified.</p></fieldset>
    <p>Approval confirms proposed shoot dates. A month-only estimate needs concrete dates before approval. Equipment bookings are managed separately.</p><button className="production-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
  </form>}</section>
}
function DecisionFeed({ api, briefs, deliveries, access, preview, onOpen, onRefresh }: { api: ProductionClient; briefs: ProductionBrief[]; deliveries: Delivery[]; access: ProductionAccess; preview: boolean; onOpen: (id: string) => void; onRefresh: () => Promise<void> }) {
  const [events,setEvents] = useState<{ brief: ProductionBrief; event: BriefEvent }[]>([]), [error,setError] = useState(''), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true)
  useEffect(() => { let active = true; setLoading(true); Promise.all(briefs.map(b => api.get(b.id))).then(values => { if (active) setEvents(values.flatMap(brief => brief.events.filter(e => ['approved','denied','changes_requested','withdrawn','scheduled'].includes(e.kind)).map(event => ({ brief,event }))).sort((a,b) => b.event.createdAt.localeCompare(a.event.createdAt))) }).catch(e => { if (active) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [api,briefs])
  return <section className="production-decisions"><h2>Executive Leadership Team decisions</h2><p>Review outcomes, reasons, and confirmed dates. {preview ? 'Preview sends no email.' : 'Email delivery is tracked separately from the saved decision.'}</p>{error && <p role="alert" className="production-error">{error}</p>}{loading && <p role="status">Loading decisions…</p>}{!loading && !events.length && <p className="production-empty">No decisions yet. Submitted briefs will appear here after leadership reviews them.</p>}{events.map(({brief,event}) => { const jobs = deliveries.filter(d => d.eventId === event.id); return <article className="production-decision" key={event.id}><div><button className="production-row-title" onClick={() => onOpen(brief.id)}>{event.snapshot?.projectName || brief.data.projectName}</button><span className={`production-status status-${event.kind === 'scheduled' ? 'approved' : event.kind}`}>{event.kind.replaceAll('_',' ')}</span></div>{event.shootStartsAt && <p>Confirmed shoot: {dateLabel(event.shootStartsAt)} – {dateLabel(new Date(Date.parse(event.shootEndsAt!) - 1).toISOString())}</p>}<p>{event.actorName} · {new Date(event.createdAt).toLocaleString()} · Revision {event.version}</p>{event.comment && <blockquote>{event.comment}</blockquote>}<p>{jobs.length ? jobs.map(d => `${d.status} (${d.attempts} attempt${d.attempts === 1 ? '' : 's'})`).join(' · ') : 'No email delivery was queued for this decision.'}</p>{access.canAdminister && jobs.filter(d => ['failed','uncertain'].includes(d.status)).map(d => <button key={d.id} disabled={busy} onClick={() => { if (!window.confirm('Retry this delivery? An uncertain delivery may already have reached its recipient.')) return; setBusy(true); api.retry(d.id).then(onRefresh).catch(e => setError(errorText(e))).finally(() => setBusy(false)) }}>Retry {d.status} delivery</button>)}</article> })}</section>
}
