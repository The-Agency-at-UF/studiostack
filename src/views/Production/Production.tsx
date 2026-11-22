'use client'
import Link from 'next/link'
import { PageHeader, WorkspaceTabs, Field, TableRegion, DetailPanel, Select, Skeleton, StatusLabel, LoadError, Notice, Button } from '../../components/workspace/WorkspaceUI'
import { tabPanelProps } from '../../components/workspace/tabs'
import { dateTimeLabel, statusLabel } from '../../format'
import { Pagination } from '../../components/workspace/Pagination'
import { usePagination } from '../../components/workspace/usePagination'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { useAppSession } from '../../context/AppSessionContext'
import { createDatabaseApiClient } from '../../api/database'
import { authConfiguration } from '../../auth/cognito'
import {createPreviewDatabaseApi} from '../../preview/database'
import {storePreviewFile,previewAttachmentKey} from '../../preview/media'
import { createPreviewProductionClient } from '../../production/preview'
import { briefByteLimit, briefBytes, briefSections, cleanText, dateErrors, emptyBrief, normalizedBrief, productionIsOnSite, productionTypes, statusLabels, visibleSections, type BriefCommand, type BriefData, type BriefEvent, type Delivery, type ProductionAccess, type ProductionBrief, type ProductionSettings } from '../../types/production'
import type { ApiMember } from '../../types/database-api'
import type { ProductionClient } from '../../api/production'
import { SearchableSelect } from '../../components/workspace/SearchableSelect'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import BriefClientField from './BriefClientField'
import ClientAccounts,{DeletedClientAccounts} from './ClientAccounts'
import {clientDeletable} from './clientPermissions'
import ProductionCrew from './ProductionCrew'
import IdeaBoard from './IdeaBoard'
import CrewRequests from './CrewRequests'
import type {BriefUploadsProps} from './BriefUploads'
import BriefSection from './BriefSection'
import BriefSteps from './BriefSteps'
import SoftHolds from './SoftHolds'
import ReadinessChecklist from './ReadinessChecklist'
import {productionReadiness,softHoldsFor} from '../../production/readiness'
import {HiOutlineFlag} from 'react-icons/hi2'
import {ResourceLinks} from '../../resources/links'
import type {ClientAccount} from '../../types/production'
import EmailVerification from './EmailVerification'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import { errorText } from '../../api/errorText'
import { useToast } from '../../components/workspace/Toast'
const ProductionCalendar = dynamic(() => import('./ProductionCalendar'), { ssr: false, loading: () => <Skeleton label="Loading calendar…" variant="tile" count={6} /> })
/** What each review action tells the person once the server accepts it. */
const actionDone: Record<BriefCommand['action'], string> = {
  submit: 'Brief submitted for review.',
  approve: 'Brief approved. Shoot dates are confirmed.',
  deny: 'Brief denied.',
  request_changes: 'Changes requested.',
  schedule: 'Confirmed shoot dates updated.',
  withdraw: 'Request withdrawn.',
  reopen: 'Brief reopened as a draft.',
  comment: 'Comment added.',
  propose_dates: 'Shoot dates proposed.'
}
function briefShootLabel(brief: ProductionBrief) {
  const holds = softHoldsFor(brief)
  if (holds.length === 1) return `${dateLabel(holds[0].startsAt)} · tentative`
  if (holds.length > 1) return `${holds.length} unconfirmed soft holds`
  const estimate = productionIsOnSite(brief.data) && brief.data.fields.shootEstimate
  return estimate ? `${estimate} · estimate` : 'Not proposed'
}
/** The request fields a recorded revision shows, labelled as on the form (internal ids such as clientAccountId are left out). */
const snapshotFields = [['projectName', 'Project name'], ['client', 'Client'], ['managers', 'Account / project managers'], ['supervisor', 'Production supervisor'], ['deliveryDate', 'Target delivery date']] as const
/** Each brief step gets its own history entry, so Back returns to the previous step instead of leaving the brief. */
function stepUrl(step: string) { const url = new URL(window.location.href); if (url.searchParams.get('step') === step) return; if (step === 'request' && !url.searchParams.has('step')) return; url.searchParams.set('step', step); window.history.pushState(window.history.state, '', url) }
const stepFromUrl = () => new URLSearchParams(window.location.search).get('step') ?? 'request'
/** Unsaved edits are mirrored here, so an expired session, crash or closed tab never loses them. */
const draftKey = (briefId: string) => `studiostack.brief-draft.${briefId}`
type StashedDraft = { version: number; savedAt: number; data: BriefData }
const readDraft = (briefId: string): StashedDraft | null => { try { const raw = localStorage.getItem(draftKey(briefId)); return raw ? JSON.parse(raw) as StashedDraft : null } catch { return null } }
const clearDraft = (briefId: string) => { try { localStorage.removeItem(draftKey(briefId)) } catch { /* storage unavailable */ } }
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10)
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not scheduled'
function useProductionClient(organizationId: string, person: string) {
  const session = useAppSession()
  return useMemo(() => {
    if (session.mode === 'preview') return { api: createPreviewProductionClient(person), database: createPreviewDatabaseApi(person), error: '' }
    if (!session.getAccessToken || !organizationId) return { api: null, database: null, error: 'You need an active organization membership to open Production.' }
    try { const database = createDatabaseApiClient({ baseUrl: authConfiguration().apiUrl, getAccessToken: session.getAccessToken }); return { api: database.production(organizationId), database, error: '' } }
    catch { return { api: null, database: null, error: 'The authenticated production service is not configured at this address.' } }
  }, [session.mode, session.getAccessToken, organizationId, person])
}
type CachedProduction = { briefs: ProductionBrief[]; access: ProductionAccess | null; clients: ClientAccount[]; deliveries: Delivery[] }
export default function Production({ view = 'workspace' }: { view?: 'workspace' | 'calendar' } = {}) {
  const calendarPage = view === 'calendar'
  const session = useAppSession(), preview = session.mode === 'preview'
  const {organizations,selectedOrganizationId,setSelectedOrganizationId} = session
  const [organizationId, setOrganizationId] = useState(session.selectedOrganizationId??session.organizations?.[0]?.id ?? '')
  const appliedOrganizationLink=useRef(false)
  useEffect(() => { const id = appliedOrganizationLink.current?null:new URLSearchParams(window.location.search).get('organization');appliedOrganizationLink.current=true; if (id && organizations?.some(o => o.id === id)) {setOrganizationId(id);setSelectedOrganizationId?.(id)} else if(selectedOrganizationId)setOrganizationId(selectedOrganizationId) }, [organizations,selectedOrganizationId,setSelectedOrganizationId])
  const [person, setPerson] = useState(session.previewPersonId??'preview-author')
  useEffect(()=>{if(session.previewPersonId)setPerson(session.previewPersonId)},[session.previewPersonId])
  const { api, database, error: configurationError } = useProductionClient(organizationId, person)
  const cacheKey = `production:${organizationId}${preview ? ':' + person : ''}`
  // Read the initial snapshot only when the workspace changes. Cache writes
  // must not recreate refresh and restart its loading effect.
  const cached = useMemo(() => getCached<CachedProduction>(cacheKey), [cacheKey])
  const [briefs, setBriefs] = useState<ProductionBrief[]>(cached?.briefs ?? []), [access, setAccess] = useState<ProductionAccess | null>(cached?.access ?? null)
  const [selected, setSelected] = useState<ProductionBrief | null>(null), [form, setForm] = useState<BriefData>(emptyBrief)
  const [tab, setTab] = useState<'briefs' | 'calendar' | 'decisions' | 'settings' | 'clients' | 'ideas' | 'queue'>(calendarPage ? 'calendar' : 'briefs')
  const [clients,setClients]=useState<ClientAccount[]>(cached?.clients ?? []),[clientFilter,setClientFilter]=useState(''),[authorFilter,setAuthorFilter]=useState('')
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [loading, setLoading] = useState(!cached), [busy, setBusy] = useState(false)
  const toast = useToast()
  const [briefsError, setBriefsError] = useState(''), [deliveriesFailed, setDeliveriesFailed] = useState(false)
  const [restorable, setRestorable] = useState<StashedDraft | null>(null), [saveBlocked, setSaveBlocked] = useState<{ key: string; n: number } | null>(null)
  const [step, setStep] = useState(stepFromUrl), [reviewDraft, setReviewDraft] = useState(false)
  const lastOpened = useRef<string | null>(null)
  const [error, setError] = useState(''), [deliveries, setDeliveries] = useState<Delivery[]>(cached?.deliveries ?? [])
  const [pendingDelete, setPendingDelete] = useState<ProductionBrief | null>(null)
  /** Where to go once the person agrees to discard unsaved brief edits. */
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const [pendingApprove, setPendingApprove] = useState<ProductionBrief | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{ briefId: string; id: string; name: string } | null>(null)
  const [clientCreating,setClientCreating]=useState(false)
  const newBriefButton = useRef<HTMLButtonElement>(null), focusNewBrief = useRef(false)
  const [dirty, setDirty] = useState(false), [snapshot, setSnapshot] = useState<BriefEvent | null>(null)
  // Counts successful saves; a new count replays the one-time "saved" pulse on the save bar.
  const [savedPulse, setSavedPulse] = useState(0)
  const generation = useRef(0), mutation = useRef<{ key: string; id: string } | null>(null)
  const selection = useRef(0)
  const shownBrief = useRef(false), dirtyRef = useRef(false), selectedIdRef = useRef<string | null>(null)
  dirtyRef.current = dirty; selectedIdRef.current = selected?.id ?? null
  // Refreshes can overlap now that saves no longer wait for them; only the newest one may update the page.
  const refreshes = useRef(0)
  const requestId = (key: string) => { if (mutation.current?.key !== key) mutation.current = { key, id: crypto.randomUUID() }; return mutation.current.id }
  const refresh = useCallback(async () => {
    if (!api) return
    const current = generation.current, sequence = ++refreshes.current
    const stale = () => current !== generation.current || sequence !== refreshes.current
    const a = await api.access()
    if (stale()) return
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

    if (stale()) return
    // A failed list read is shown as a failure with Retry, never as an empty workspace.
    if (briefsRes.status === 'fulfilled') { setBriefs(briefsRes.value); setBriefsError('') }
    else setBriefsError(errorText(briefsRes.reason))
    setDeliveriesFailed(deliveriesRes.status === 'rejected')
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
    const effectGeneration = ++generation.current, initialSelection = ++selection.current
    const id = new URLSearchParams(window.location.search).get('brief')
    setPendingDelete(null); setSelected(null); setError(''); setBriefsError(''); setDirty(false)
    setBriefs(cached?.briefs ?? []); setAccess(cached?.access ?? null); setClients(cached?.clients ?? []); setDeliveries(cached?.deliveries ?? [])
    setLoading(!cached)
    let active = true
    const mayOpenLink = () => active && generation.current===effectGeneration && selection.current===initialSelection && !dirtyRef.current
    refresh().then(async () => {
      if (!id || !api || !mayOpenLink()) return
      const brief = await api.get(id)
      if (mayOpenLink()) accept(brief)
    }).catch(e => { if (mayOpenLink()) setError(errorText(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; generation.current = effectGeneration + 1 }
  }, [refresh,api,cached])
  useEffect(()=>{const guard=(event:Event)=>{if(!dirty)return;event.preventDefault();const proceed=(event as CustomEvent<{proceed?:()=>void}>).detail?.proceed;if(proceed)setPendingLeave(()=>proceed)};window.addEventListener('preview-account-change',guard);return()=>window.removeEventListener('preview-account-change',guard)},[dirty])
  useEffect(() => { const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload) }, [dirty])
  useEffect(() => {
    if (!dirty) return
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(target instanceof HTMLAnchorElement) || target.target === '_blank' || target.hasAttribute('download')) return
      const next = new URL(target.href, window.location.href)
      if (next.origin === window.location.origin && next.pathname === window.location.pathname && next.search === window.location.search) return
      event.preventDefault(); event.stopPropagation()
      // Follow the link again once the guard is gone, so client-side routing still applies.
      setPendingLeave(() => () => window.setTimeout(() => { if (target.isConnected) target.click(); else window.location.assign(next.href) }, 0))
    }
    document.addEventListener('click', guardNavigation, true)
    return () => document.removeEventListener('click', guardNavigation, true)
  }, [dirty])
  /** Runs `go` now, or after the person confirms discarding unsaved edits. */
  const leaveThen = (go: () => void) => { if (dirty || reviewDraft) setPendingLeave(() => go); else go() }
  const discardAndLeave = () => { const go = pendingLeave; setPendingLeave(null); if (selected) clearDraft(selected.id); setDirty(false); setReviewDraft(false); setRestorable(null); go?.() }
  const accept = (brief: ProductionBrief) => {
    setSelected(brief); setForm(structuredClone(brief.data)); setDirty(false); setSnapshot(null)
    const stash = readDraft(brief.id)
    if (stash && stash.version === brief.version && JSON.stringify(stash.data) !== JSON.stringify(brief.data)) setRestorable(stash)
    else { setRestorable(null); if (stash) clearDraft(brief.id) }
  }
  const open = (id: string) => leaveThen(() => void load(id))
  const load = async (id: string) => {
    if (!api || busy) return
    const n = ++selection.current, g = generation.current
    setError(''); setBusy(true)
    try { const b = await api.get(id); if (n === selection.current && g === generation.current) accept(b) } catch (e) { if (g === generation.current) setError(errorText(e)) } finally { if (g === generation.current) setBusy(false) }
  }
  /**
   * Shows the server's answer as soon as it arrives and reloads the workspace in the background,
   * so the page unlocks without waiting for every brief, delivery and client to page in again.
   * Resolves true once the change is saved.
   */
  const run = async (task: (client: ProductionClient) => Promise<ProductionBrief | void>, done: string | null) => {
    if (!api || busy) return false
    const g = generation.current
    selection.current++
    setBusy(true); setError(''); toast.dismiss('production')
    try {
      const b = await task(api); if (g !== generation.current) return false
      if (b) { accept(b); setBriefs(list => [b, ...list.filter(item => item.id !== b.id)]) }
      mutation.current = null; invalidateCache(cacheKey)
      if (done) toast.success(done, { id: 'production' })
      refresh().catch(e => { if (g === generation.current) setError(errorText(e)) })
      return true
    }
    catch (e) { if (g === generation.current) toast.error(errorText(e), { id: 'production', action: { label: 'Reload', onClick: () => reloadRef.current() } }); return false } finally { if (g === generation.current) setBusy(false) }
  }
  const reload = () => leaveThen(() => void (selected ? load(selected.id) : run(async () => { await refresh() }, null)))
  const reloadRef = useRef(reload); reloadRef.current = reload
  const save = () => {
    if (!selected) return
    // A date mistake opens its step and focuses the field, instead of a toast far from the cause.
    const invalid = dateErrors(form, true)[0]
    if (invalid) { setSaveBlocked(b => ({ key: invalid.key, n: (b?.n ?? 0) + 1 })); toast.error(invalid.message, { id: 'production' }); return }
    const data = normalizedBrief(form)
    if (briefBytes(data) > briefByteLimit) { toast.error('This brief is too long to save. Shorten the longest answers, or move detail into an attached file.', { id: 'production' }); return }
    return run(async client => { const brief = await client.save(selected.id, data, selected.version, requestId(JSON.stringify({ save: selected.id, version: selected.version, data }))); clearDraft(selected.id); setRestorable(null); setSavedPulse(n => n + 1); return brief }, null)
  }
  const action = async (command: Omit<BriefCommand, 'version' | 'requestId'>) => {
    if (!selected) return false
    const brief = selected
    // A comment has no side effects, so it joins the history at once; a failed send takes it back out.
    const pending: BriefEvent | null = command.action === 'comment' && !busy ? { id: `pending:${crypto.randomUUID()}`, actorId: access?.userId ?? '', actorName: 'You', kind: 'comment', comment: command.comment ?? '', section: command.section ?? '', version: brief.version, createdAt: new Date().toISOString(), snapshot: null } : null
    if (pending) setSelected(s => s?.id === brief.id ? { ...s, events: [...s.events, pending] } : s)
    const saved = await run(client => client.action(brief.id, { ...command, version: brief.version, requestId: requestId(JSON.stringify({ id: brief.id, version: brief.version, command })) }), actionDone[command.action])
    if (pending && !saved) setSelected(s => s?.id === brief.id ? { ...s, events: s.events.filter(e => e.id !== pending.id) } : s)
    return saved
  }
  const deletable = (brief: ProductionBrief) => (brief.ownerId === access?.userId || Boolean(access?.canAdminister)) && ['draft','denied','withdrawn'].includes(brief.status)
  const remove = (brief: ProductionBrief) => setPendingDelete(brief)
  const confirmDelete = async () => {
    if (!pendingDelete || busy) return
    await run(async client => { await client.remove(pendingDelete.id,pendingDelete.version); setBriefs(list => list.filter(b => b.id !== pendingDelete.id)); setSelected(null); setDirty(false); setSnapshot(null); focusNewBrief.current = true }, 'Brief deleted.')
    setPendingDelete(null)
  }
  // Control characters pasted from other apps are dropped as typed, since the server refuses them.
  const update = (key: keyof BriefData, value: string | string[]) => { setForm(f => ({ ...f, [key]: typeof value === 'string' ? cleanText(value) : value })); setDirty(true) }
  const updateField = (key: string, value: string) => { setForm(f => ({ ...f, fields: { ...f.fields, [key]: cleanText(value) } })); setDirty(true) }
  // Mirror unsaved edits so an expired session or closed tab never loses them.
  useEffect(() => { if (!selected || !dirty) return; const t = window.setTimeout(() => { try { localStorage.setItem(draftKey(selected.id), JSON.stringify({ version: selected.version, savedAt: Date.now(), data: form } satisfies StashedDraft)) } catch { /* storage full or unavailable */ } }, 400); return () => window.clearTimeout(t) }, [form, dirty, selected])
  const editable = (selected?.ownerId === access?.userId || Boolean(access?.canAdminister)) && ['draft','changes_requested'].includes(selected?.status ?? '')
  const uploads:BriefUploadsProps|null=selected?{brief:selected,editable,disabled:busy||dirty,preview,onDownload:a=>void run(async client=>{const download=await client.download(selected.id,a.id);const link=document.createElement('a');link.href=download.url;if(preview)link.download=a.name;link.target='_blank';link.rel='noopener noreferrer';link.click()},null),onRemove:a=>setPendingRemoval({briefId:selected.id,id:a.id,name:a.name}),onComplete:a=>void run(client=>client.complete(selected.id,a.id),'Attachment uploaded.'),onUpload:async(files,category)=>{const uploaded=await run(async client=>{let brief=selected;for(const file of files){const id=crypto.randomUUID(),upload=await client.attach(selected.id,{id,name:file.name,contentType:file.type,size:file.size,category}),body=new FormData();Object.entries(upload.fields).forEach(([key,value])=>body.append(key,value));body.append('file',file);if(preview){await storePreviewFile(previewAttachmentKey(selected.id,id),file)}else{const response=await fetch(upload.url,{method:'POST',body,credentials:'omit',redirect:'error'});if(!response.ok)throw new Error('Upload failed. Reload to finish or remove the pending file.');}brief=await client.complete(selected.id,id)}return brief},files.length===1?`${files[0].name} uploaded.`:`${files.length} files uploaded.`);if(!uploaded)throw new Error('File upload failed')}}:null
  const byClient=briefs.filter(b=>!clientFilter||(b.data.clientAccountId??b.data.client)===clientFilter)
  const authors=[...new Map(briefs.map(b=>[b.ownerId,b.ownerName||'Unknown'])).entries()].sort((a,b)=>a[1].localeCompare(b[1]))
  const clientOptions=[...new Map(briefs.filter(b=>b.data.client).map(b=>[b.data.clientAccountId??b.data.client,b.data.client])).entries()].sort((a,b)=>a[1].localeCompare(b[1]))
  const filtered = byClient.filter(b => (tab !== 'queue' || b.status === 'submitted') && (filter === 'all' || b.status === filter) && (!authorFilter || b.ownerId === authorFilter) && `${b.data.projectName} ${b.data.client} ${b.ownerName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  const briefsPage = usePagination(filtered, [organizationId, person, tab, query, filter, clientFilter, authorFilter])
  const loadMembers = useCallback(async (): Promise<ApiMember[]> => {
    if (preview) return (await api!.people()).items
    const people: ApiMember[] = []; let after: string | undefined
    do { const p = await api!.people(after); people.push(...p.items); after = p.nextCursor ?? undefined } while (after)
    return people.filter(p => p.status === 'active')
  }, [preview,api])
  const inspector=!(editable&&selected?.status==='draft')
  const crewVisible=selected?.status==='approved'||Boolean(selected?.crew?.length)
  // Keep the open brief in the address bar so it can be bookmarked or shared, and so Back returns to the list.
  useEffect(() => {
    const url = new URL(window.location.href), current = url.searchParams.get('brief'), wanted = selected?.id ?? null
    // A ?brief= link is still loading on first render; leave it for the loader to read.
    if (current === wanted || (!wanted && !shownBrief.current)) return
    if (wanted) shownBrief.current = true
    if (wanted) url.searchParams.set('brief', wanted); else url.searchParams.delete('brief')
    if (current !== wanted) { url.searchParams.delete('step'); setStep('request') }
    window.history[wanted && !current ? 'pushState' : 'replaceState'](window.history.state, '', url)
  }, [selected?.id])
  useEffect(() => {
    const onPop = () => {
      if (new URLSearchParams(window.location.search).get('brief')) return
      if (dirtyRef.current) { const url = new URL(window.location.href); url.searchParams.set('brief', selectedIdRef.current ?? ''); window.history.pushState(window.history.state, '', url); setPendingLeave(() => () => { setSelected(null); setDirty(false) }); return }
      setSelected(null); setDirty(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // Opening a brief moves focus to its title; going back returns it to the row that opened it.
  useEffect(() => {
    const shownId = selected?.id ?? null
    if (shownId) { if (lastOpened.current !== shownId) { lastOpened.current = shownId; window.setTimeout(() => document.querySelector<HTMLElement>('.production-detail .production-form > h2')?.focus(), 0) } return }
    const id = lastOpened.current; lastOpened.current = null
    if (id && !focusNewBrief.current) window.setTimeout(() => document.querySelector<HTMLElement>(`[data-brief-row="${id}"]`)?.focus(), 0)
  }, [selected?.id])
  useEffect(() => { const onPop = () => setStep(stepFromUrl()); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => {
    if (!busy && !pendingDelete && newBriefButton.current && focusNewBrief.current) {
      focusNewBrief.current = false
      newBriefButton.current.focus()
    }
  }, [busy, pendingDelete])
  const newBrief = () => leaveThen(startBrief)
  function startBrief() {
    const blank = briefs.find(b => {
      const d = b.data
      return b.ownerId === access?.userId && b.status === 'draft' && !b.submission && !b.attachments.length && !b.softHolds?.length
        && !d.projectName.trim() && !d.client.trim() && !d.clientAccountId && !d.managers.trim() && !d.supervisor.trim()
        && !d.deliveryDate && !d.productionTypes.length && !d.crewRequests?.length && Object.values(d.fields).every(value => !value.trim())
    })
    if (blank) void load(blank.id)
    else void run(client => client.create(emptyBrief(), requestId('create')), 'Brief created.')
  }
  const selectView = (next: typeof tab) => leaveThen(() => { setTab(next); setSelected(null); setDirty(false); setSnapshot(null) })
  return <main className={calendarPage ? 'production-page ws-calendar-page' : 'production-page'}>
    {pendingLeave && <ConfirmDialog title="Discard unsaved changes?" subject={form.projectName || 'Untitled brief'} description={dirty ? 'Your edits to this brief haven’t been saved. Save the draft first to keep them.' : 'Your comment hasn’t been posted yet.'} confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={() => setPendingLeave(null)} onConfirm={discardAndLeave} />}
    {pendingRemoval && <ConfirmDialog title="Remove this attachment?" subject={pendingRemoval.name} description="It will be removed from the current brief. Submitted revisions keep their files." confirmLabel="Remove attachment" onCancel={() => setPendingRemoval(null)} onConfirm={() => { const { briefId, id } = pendingRemoval; setPendingRemoval(null); void run(async client => { await client.discard(briefId,id); return client.get(briefId) }, 'Attachment removed.') }} />}
    {pendingApprove && <ConfirmDialog tone="default" title="Approve this brief?" subject={pendingApprove.data.projectName || 'Untitled brief'} description={`${briefShootLabel(pendingApprove)}. The author and Executive Leadership Team are emailed about the decision.`} confirmLabel="Approve brief" cancelLabel="Keep reviewing" busy={busy} onCancel={() => setPendingApprove(null)} onConfirm={() => { const b = pendingApprove; setPendingApprove(null); void run(client => client.action(b.id, { action: 'approve', version: b.version, requestId: requestId(JSON.stringify({ approve: b.id, version: b.version })) }), 'Brief approved.') }} />}
    {pendingDelete && <ConfirmDialog title={pendingDelete.status === 'draft' ? 'Delete this draft?' : 'Delete this brief?'} subject={pendingDelete.data.projectName || 'Untitled brief'} description="It is removed for everyone in this organization, with its files. This can’t be undone." confirmLabel={pendingDelete.status === 'draft' ? 'Delete draft' : 'Delete brief'} cancelLabel="Keep it" busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => void confirmDelete()} />}
    <PageHeader title={calendarPage ? 'Production calendar' : 'Briefs & production'} actions={<>{calendarPage&&<Link className="ws-button" href="/production/">View briefs</Link>}{!selected&&(tab==='briefs'||calendarPage)&&<button className="production-primary" disabled={busy||!api||!access} ref={newBriefButton} onClick={newBrief}>New brief</button>}</>}/>

    {preview && <p className="production-info">Local preview. Records and uploaded files stay in this browser. Email delivery is simulated.</p>}
    {!preview && session.getAccessToken && <EmailVerification getAccessToken={session.getAccessToken} />}
    {configurationError && <p role="alert" className="production-error">{configurationError}</p>}
    {!calendarPage && <WorkspaceTabs label="Production views" active={tab} disabled={busy} items={(['briefs','clients','ideas',...(access?.canReview?['queue']:[]), ...(access?.isExecutive || access?.canReview || access?.canAdminister ? ['decisions'] : []), ...(access?.canAdminister ? ['settings'] : [])]).map(value=>({value,label:({ clients:'Client accounts',ideas:'Ideas & pitches',queue:'Brief review queue',briefs:'Briefs',decisions:'Decisions & delivery',settings:'Production roles' } as Record<string,string>)[value]}))} onChange={value=>selectView(value as typeof tab)}/>}
    <div className="production-feedback">{error && <Notice kind="error" role="alert" action={<Button disabled={busy} onClick={reload}>Reload</Button>}>{error}</Notice>}</div>
    <div {...(calendarPage ? {} : tabPanelProps('Production views', tab))}>
    {loading ? <Skeleton label="Loading production workspace…" variant="row" count={5} /> : !api ? null : !access ? (
      <div className="production-empty">
        <h2>Production workspace unavailable</h2>
        <p>The production workspace could not be loaded. Check your connection or try again.</p>
        <button className="production-primary" disabled={busy} onClick={() => void run(async () => { await refresh() }, null)}>Retry loading workspace</button>
      </div>
    ) : tab === 'ideas' ? <IdeaBoard key={organizationId+person} api={api} access={access} clients={clients} onBrief={idea=>{setTab('briefs');void run(c=>c.create({...emptyBrief(),projectName:idea.title,clientAccountId:idea.clientAccountId,client:clients.find(c=>c.id===idea.clientAccountId)?.name??'',fields:{...emptyBrief().fields,concept:idea.pitch}},crypto.randomUUID()),'Brief created from the idea.')}} /> : tab === 'clients' ? <><ClientAccounts key={organizationId+person} clients={clients} api={api} database={access.canAdminister?database:null} organizationId={organizationId||'preview'} canManage={access.canReview} canDelete={c=>clientDeletable(c,access.userId,access.canAdminister)} onRefresh={refresh}/>{!access.canAdminister&&clients.some(c=>c.deletedAt&&clientDeletable(c,access.userId,false))&&<DeletedClientAccounts key={'deleted'+organizationId+person} clients={clients} api={api} canRestore={c=>access.canAdminister||clientDeletable(c,access.userId,false)} onRefresh={refresh}/>}</> : tab === 'settings' ? <><ProductionSettingsForm key={organizationId + person} api={api} loadMembers={loadMembers} onSaved={refresh} />{}</> : tab === 'decisions' ? <DecisionFeed key={organizationId+person} api={api} briefs={briefs} deliveries={deliveries} deliveriesFailed={deliveriesFailed} access={access} preview={preview} onOpen={id => { setTab('briefs'); void open(id) }} onRefresh={refresh} /> : <>
      {!selected && briefsError && <LoadError what="Briefs" message={briefsError} onRetry={() => void run(async () => { await refresh() }, null)} retrying={busy} />}
      {!selected && !briefsError && (tab === 'calendar' ? <ProductionCalendar key={organizationId+person} viewKey={organizationId+person} showSoftHoldsByDefault={access.canAdminister||access.canReview} briefs={byClient} onOpen={id => void open(id)} filter={<SearchableSelect className="production-client-filter" label="Client" allLabel="All clients" placeholder="Search clients" value={clientFilter} onChange={setClientFilter} options={clientOptions} />} /> : <>
        <div className="production-toolbar"><Field className="production-search" label="Search briefs"><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Project, client, or author" /></Field><SearchableSelect className="production-client-filter" label="Client" allLabel="All clients" placeholder="Search clients" value={clientFilter} onChange={setClientFilter} options={clientOptions} /><SearchableSelect className="production-client-filter" label="Requested by" allLabel="All people" placeholder="Search people" value={authorFilter} onChange={setAuthorFilter} options={authors} /><label>Status<Select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></label></div>
        <div className="production-filter-summary" aria-live="polite"><span>{filtered.length} {filtered.length===1?'brief':'briefs'}{query||filter!=='all'||clientFilter||authorFilter?' · Filters applied':''}</span>{(query||filter!=='all'||clientFilter||authorFilter)&&<button onClick={()=>{setQuery('');setFilter('all');setClientFilter('');setAuthorFilter('')}}>Clear filters</button>}</div>
        <TableRegion className="production-table-wrap" label="Production briefs"><table className="production-table"><thead><tr><th scope="col">Project / client</th><th scope="col">Status</th><th scope="col">Requested by</th><th scope="col">Shoot</th><th scope="col">Delivery</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody className="ws-stagger">{briefsPage.pageRows.map(b => <tr key={b.id} className="production-row" onClick={e => { if (!busy && !(e.target as Element).closest('button,a,input,select,label')) void open(b.id) }}><td><button className="production-row-title" data-brief-row={b.id} disabled={busy} onClick={() => void open(b.id)}>{b.data.projectName || 'Untitled brief'}</button>{productionReadiness(b).flagged&&(b.ownerId===access.userId||access.canAdminister||access.canReview)&&<span className="production-error"><HiOutlineFlag aria-hidden="true"/> Readiness needs attention</span>}<span>{b.data.client || 'Client not added'}{!b.data.projectName && ` · started ${dateLabel(b.createdAt)}`}</span></td><td><span className={`production-status status-${b.status}`}>{statusLabels[b.status]}</span></td><td>{b.ownerName}</td><td>{b.shootStartsAt ? dateLabel(b.shootStartsAt) : briefShootLabel(b)}</td><td>{b.data.deliveryDate ? dateLabel(b.data.deliveryDate) : 'Not set'}</td><td><div className="production-row-actions">{tab==='queue'&&b.status==='submitted'&&<><button disabled={busy} onClick={()=>setPendingApprove(b)}>Approve</button><button disabled={busy} className="production-danger" onClick={()=>{setTab('queue');void open(b.id)}}>Deny with reason</button></>}{deletable(b) && <button className="production-row-delete" disabled={busy} aria-label={`Delete ${b.data.projectName || 'untitled brief'}`} onClick={() => remove(b)}>Delete</button>}</div></td></tr>)}</tbody></table>{!filtered.length && <div className="production-empty"><h2>{tab === 'queue' ? 'Nothing to review' : briefs.length ? 'No matching briefs' : 'Start with a brief'}</h2><p>{tab === 'queue' ? 'Submitted briefs wait here for a Production Lead’s decision.' : briefs.length ? 'Try another search or status.' : 'Create a production request to share the scope, dates, and deliverables with Production leadership.'}</p></div>}<Pagination label={tab === 'queue' ? 'Review queue' : 'Production briefs'} pagination={briefsPage.pagination} /></TableRegion>
      </>)}
      {selected && <div className="production-detail ws-enter"><div className="production-detail-header"><button disabled={busy} onClick={() => leaveThen(() => { setSelected(null); setDirty(false) })}>← Back to {tab === 'calendar' ? 'calendar' : 'briefs'}</button><span className={`production-status status-${selected.status}`}>{statusLabels[selected.status]}</span><span>{selected.submission ? `Submitted ${selected.submission === 1 ? 'once' : `${selected.submission} times`}` : 'Not submitted yet'}</span><button disabled={busy} onClick={() => window.print()}>Print or save as PDF</button>{deletable(selected) && <button className="production-danger" disabled={busy} onClick={() => remove(selected)}>{selected.status === 'draft' ? 'Delete draft' : 'Delete brief'}</button>}</div>
        {restorable && <Notice kind="warning" action={<><Button onClick={() => { setForm(structuredClone(restorable.data)); setDirty(true); setRestorable(null) }}>Restore edits</Button><Button variant="quiet" onClick={() => { clearDraft(selected.id); setRestorable(null) }}>Discard</Button></>}>This brief has unsaved edits from {dateTimeLabel(restorable.savedAt)} that were never saved.</Notice>}
        <div className={inspector?'production-detail-grid':'production-detail-grid is-single'}><div>
          {!editable&&<nav className="production-section-nav" aria-label="Brief sections"><a href="#brief-resources">Templates & guide</a><a href="#brief-request">Request details</a>{visibleSections(form).map(section=><a key={section.title} href={`#brief-${section.title.toLowerCase().replaceAll(' ','-')}`}>{section.title}</a>)}<a href="#brief-crew">Crew</a></nav>}
          <form className="production-form" onSubmit={e => { e.preventDefault(); if(!clientCreating)void save() }}>
            <h2 tabIndex={-1}>{selected.data.projectName || 'New production brief'}</h2><p className="production-muted">Created by {selected.ownerName} · {dateLabel(selected.createdAt)}</p>
            <section id="brief-resources" className="production-brief-downloads" aria-labelledby="brief-downloads-title"><h3 id="brief-downloads-title">Templates & guide</h3><p>Download the official forms first. Upload completed copies beside the matching questions below.</p><ResourceLinks compact/><p className="production-file-limit">Up to 20 files per brief, 20 MiB each. Files upload as soon as you add them; adding files is paused while the draft has unsaved changes.</p></section>
            {editable&&uploads?<BriefSteps key={selected.id} step={step} onStep={id => { setStep(id); stepUrl(id) }} saveBlocked={saveBlocked} saving={busy && !clientCreating} form={form} clients={clients} onChange={update} onField={updateField} onClientAccount={id=>{const c=clients.find(c=>c.id===id);setForm(f=>({...f,clientAccountId:c?.id??null,client:c?.name??f.client}));setDirty(true)}} disabled={busy||clientCreating} dirty={dirty} clientField={<BriefClientField key={selected.id} clients={clients} value={form.clientAccountId??''} canAdd={access.canReview} disabled={!editable||busy} api={api} onCreatingChange={setClientCreating} onSelect={client=>{setForm(f=>({...f,clientAccountId:client?.id??null,client:client?.name??f.client}));setDirty(true)}} onCreated={client=>{setClients(list=>[...list.filter(c=>c.id!==client.id),client]);setForm(f=>({...f,clientAccountId:client.id,client:client.name}));setDirty(true);invalidateCache(cacheKey)}}/>} renderSection={(section,showErrors)=><BriefSection section={section} data={form} editable={editable} busy={busy} uploads={uploads} onChange={updateField} showErrors={showErrors} hideLegend/>} crewRequests={<CrewRequests requests={form.crewRequests??[]} disabled={!editable||busy} onChange={crewRequests=>{setForm(f=>({...f,crewRequests}));setDirty(true)}}/>} scheduling={<SoftHolds key={`holds:${selected.id}:${selected.version}`} brief={selected} canPropose={(selected.ownerId===access.userId||access.canReview)&&!['denied','withdrawn'].includes(selected.status)} disabled={busy||dirty} embedded onAction={action}/>} canSubmit={selected.ownerId===access.userId} submitBlocked={selected.attachments.some(a=>a.status==='pending')} onSubmit={()=>void action({action:'submit'})} reviewNotes={access.canAdminister&&!access.notificationsConfigured&&<p className="production-warning">Admin note: decision emails stay off until Executive Leadership Team members are chosen in Production roles and the sender email is verified. Submitting still works.</p>} saveStatus={<SaveStatus role="status" pulse={dirty?0:savedPulse} onSettled={()=>setSavedPulse(0)}>{dirty?'Unsaved changes':'All changes saved'}</SaveStatus>}/>:<>
            <fieldset id="brief-request" disabled={!editable || busy}><legend>Request details</legend><div className="production-fields">
              <BriefClientField key={selected.id} clients={clients} value={form.clientAccountId??''} canAdd={access.canReview} disabled={!editable||busy} api={api} onCreatingChange={setClientCreating} onSelect={client=>{setForm(f=>({...f,clientAccountId:client?.id??null,client:client?.name??f.client}));setDirty(true)}} onCreated={client=>{setClients(list=>[...list.filter(c=>c.id!==client.id),client]);setForm(f=>({...f,clientAccountId:client.id,client:client.name}));setDirty(true);invalidateCache(cacheKey)}}/>
              {(['projectName','client','managers','supervisor','deliveryDate'] as const).map(key => <label key={key}>{({ projectName: 'Project name *', client: 'Client *', managers: 'Account / project managers *', supervisor: 'Production supervisor', deliveryDate: 'Target delivery date *' })[key]}<input maxLength={key === 'managers' ? 500 : 160} type={key === 'deliveryDate' ? 'date' : 'text'} readOnly={key==='client'&&Boolean(form.clientAccountId)} value={form[key]} onChange={e => update(key,e.target.value)} /></label>)}
            </div><div className="production-type-options"><span>Production type *</span>{productionTypes.map(t => <label key={t}><input type="checkbox" checked={form.productionTypes.includes(t)} onChange={e => update('productionTypes', e.target.checked ? [...form.productionTypes,t] : form.productionTypes.filter(v => v !== t))} />{t}</label>)}</div></fieldset>
            {uploads&&visibleSections(form).map(section=><BriefSection key={section.title} section={section} data={form} editable={editable} busy={busy} uploads={uploads} onChange={updateField}/>)}
<CrewRequests requests={form.crewRequests??[]} disabled={!editable||busy} onChange={crewRequests=>{setForm(f=>({...f,crewRequests}));setDirty(true)}}/></>}

          </form>
          {!editable&&<SoftHolds key={`holds:${selected.id}:${selected.version}`} brief={selected} canPropose={(selected.ownerId===access.userId||access.canReview)&&!['denied','withdrawn'].includes(selected.status)} disabled={busy||dirty} onAction={action}/>}{crewVisible&&<div id="brief-crew"><ProductionCrew key={`${selected.id}:${selected.version}`} brief={selected} canAssign={access.canReview} disabled={busy||dirty} loadMembers={loadMembers} onAssign={async assignments=>{await run(client=>client.assign(selected.id,{assignments,version:selected.version,requestId:requestId(JSON.stringify({crew:selected.id,version:selected.version,assignments}))}),'Crew assignments saved.')}}/></div>}<article className="production-print"><h2>{selected.data.projectName || 'Production brief'}</h2><p>{selected.data.client} · {statusLabels[selected.status]} · Revision {selected.version}</p><p>Requested by {selected.ownerName} · Managers: {selected.data.managers} · Production supervisor: {selected.data.supervisor || 'Not assigned'}</p><p>Delivery: {selected.data.deliveryDate ? dateLabel(selected.data.deliveryDate) : 'Not set'} · Production: {selected.data.productionTypes.join(', ')}</p>{selected.shootStartsAt && <p>Confirmed shoot: {dateLabel(selected.shootStartsAt)} – {dateLabel(new Date(Date.parse(selected.shootEndsAt!) - 1).toISOString())}</p>}{visibleSections(selected.data).map(s => <section key={s.title}><h3>{s.title}</h3><dl>{s.fields.filter(f=>selected.data.fields[f.key]).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{selected.data.fields[f.key]}</dd></div>)}</dl></section>)}</article>

        </div>{inspector&&<DetailPanel className="production-inspector" label="Review and activity">
          <ReadinessChecklist brief={selected}/><ReviewPanel brief={selected} access={access} busy={busy} dirty={dirty} onAction={action} onDraftChange={setReviewDraft} />
          {!access.canReview&&!access.canAdminister&&!access.isExecutive&&selected.events.filter(e=>e.comment&&['denied','changes_requested','approved'].includes(e.kind)).slice(-1).map(e=><section key={e.id}><h3>Decision reason</h3><blockquote>{e.comment}</blockquote></section>)}
          {(access.canReview||access.canAdminister||access.isExecutive)&&<section className="production-history"><h3>Activity & revisions</h3>{[...selected.events].reverse().map(e => { const sending = e.id.startsWith('pending:'); return <article key={e.id} className={sending ? 'is-sending' : undefined} aria-busy={sending || undefined}><div><strong>{statusLabel(e.kind)}</strong><small>{sending ? 'Sending…' : dateTimeLabel(e.createdAt)}</small></div><p>{e.actorName}{e.section ? ` · ${e.section}` : ''}</p>{e.comment && <blockquote>{e.comment}</blockquote>}{e.snapshot && <button onClick={() => setSnapshot(e)}>View revision {e.version}</button>}</article> })}</section>}
        </DetailPanel>}</div>
        {snapshot && <section className="production-snapshot" aria-label="Submission snapshot"><div><h3>Recorded revision {snapshot.version}</h3><button onClick={() => setSnapshot(null)}>Close snapshot</button></div><p>This preserves the brief at this point in its review history.</p><dl>{snapshotFields.map(([k, label]) => <div key={k}><dt>{label}</dt><dd>{k === 'deliveryDate' ? (snapshot.snapshot![k] ? dateLabel(snapshot.snapshot![k]) : 'Not set') : snapshot.snapshot![k] || 'Not added'}</dd></div>)}<div><dt>Production types</dt><dd>{snapshot.snapshot!.productionTypes.join(', ')}</dd></div>{briefSections.flatMap(s => s.fields).filter(f => snapshot.snapshot!.fields[f.key]).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{snapshot.snapshot!.fields[f.key]}</dd></div>)}</dl>{snapshot.attachments?.map(a => <button key={a.id} disabled={busy} onClick={() => void run(async client => { const file = await client.download(selected.id,a.id); const link = document.createElement('a'); link.href = file.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click() }, null)}>Download {a.name}</button>)}</section>}
      </div>}
    </>}
    </div>
  </main>
}
function ReviewPanel({ brief, access, busy, dirty, onAction, onDraftChange }: { brief: ProductionBrief; access: ProductionAccess; busy: boolean; dirty: boolean; onAction: (command: Omit<BriefCommand,'version'|'requestId'>) => Promise<boolean>; onDraftChange: (hasDraft: boolean) => void }) {
  const [comment,setComment] = useState(''), [section,setSection] = useState(''), [start,setStart] = useState(''), [end,setEnd] = useState(''), [hold,setHold]=useState('')
  useEffect(() => { setComment(''); setSection(''); setStart(''); setEnd('');setHold('') }, [brief.id,brief.version])
  // A typed comment or decision reason counts as unsaved work, so leaving asks first.
  useEffect(() => { onDraftChange(Boolean(comment.trim())) }, [comment, onDraftChange])
  useEffect(() => () => onDraftChange(false), [onDraftChange])
  const own = brief.ownerId === access.userId
  const [pendingAction,setPendingAction] = useState<'deny' | 'withdraw' | 'approve' | null>(null)
  // The server accepts both dates or neither, end on or after start, at most 31 days apart.
  const dateIssue = hold ? '' : !start !== !end ? 'Enter both a start and an end date, or choose a soft hold.' : start && end && end < start ? 'The end date must be on or after the start date.' : start && end && end > addDays(start, 30) ? 'A confirmed shoot can last up to 31 days.' : ''
  // A comment clears the box straight away; the text comes back if it fails to send.
  const postComment = async () => { const text = comment; setComment(''); if (!await onAction({ action: 'comment', comment: text, section })) setComment(c => c || text) }
  const send = (action: BriefCommand['action']) => action === 'comment' ? postComment() : onAction({ action, comment, section, ...(hold&&['approve','schedule'].includes(action)?{softHoldId:hold}:{}), ...(['approve','schedule'].includes(action) && (start || end) ? { shootStartsAt: start ? `${start}T00:00:00.000Z` : '', shootEndsAt: end ? new Date(Date.parse(end) + 86400_000).toISOString() : '' } : {}) })
  return <section className="production-review">{pendingAction && <ConfirmDialog {...(pendingAction === 'deny' ? { title: 'Deny this production request?', description: 'Your reason will be recorded and emailed to the submitter and active ELT members.', confirmLabel: 'Deny brief', cancelLabel: 'Keep reviewing' } : pendingAction === 'approve' ? { tone: 'default' as const, title: 'Approve this brief?', description: `${hold ? 'The chosen soft hold is confirmed' : start && end ? `Confirmed shoot: ${dateLabel(start)} – ${dateLabel(end)}` : briefShootLabel(brief)}. The author and Executive Leadership Team are emailed.`, confirmLabel: hold||start||brief.shootStartsAt||softHoldsFor(brief).length===1?'Approve & confirm dates':'Approve brief', cancelLabel: 'Keep reviewing' } : { title: 'Withdraw this request?', description: 'Any confirmed shoot will be removed from the calendar. You can reopen it as a draft later.', confirmLabel: 'Withdraw request', cancelLabel: 'Keep request' })} subject={brief.data.projectName || 'Untitled brief'} onCancel={() => setPendingAction(null)} onConfirm={() => { const next = pendingAction; setPendingAction(null); void send(next) }} />}<h3>Review & scheduling</h3><p>{brief.shootStartsAt ? `Confirmed shoot: ${dateLabel(brief.shootStartsAt)} – ${dateLabel(new Date(Date.parse(brief.shootEndsAt!) - 1).toISOString())}` : 'Shoot dates become confirmed when Production approves the brief.'}</p>
    {access.canAdminister && !access.notificationsConfigured && <p className="production-warning">Decisions appear in this workspace. An administrator must choose Executive Leadership Team members, and the sender email must be verified, before decision emails go out.</p>}

    {(own || access.canReview) && !['denied','withdrawn'].includes(brief.status) && <><label>Comment / decision reason<textarea rows={4} maxLength={6000} value={comment} disabled={busy} onChange={e => setComment(e.target.value)} /></label><label>Brief section<Select value={section} disabled={busy} onChange={e => setSection(e.target.value)}><option value="">Whole brief</option>{visibleSections(brief.data).map(s => <option key={s.title}>{s.title}</option>)}</Select></label><button disabled={busy || dirty || !comment.trim()} onClick={() => send('comment')}>Add comment</button></>}
    {access.canReview && ['submitted','approved'].includes(brief.status) && <><div className="production-review-dates"><p>Changing confirmed dates moves on-site crew shifts and requires crew to be confirmed again.</p><p>{briefShootLabel(brief)}. Enter dates below to confirm a different window.</p><label>Choose a soft hold<Select value={hold} disabled={busy} onChange={e=>{setHold(e.target.value);setStart('');setEnd('')}}><option value="">Choose a proposal or enter dates</option>{softHoldsFor(brief).map(h=><option key={h.id} value={h.id}>{dateTimeLabel(h.startsAt)} – {dateTimeLabel(h.endsAt)}</option>)}</Select></label><label>Confirmed shoot starts<input type="date" disabled={busy} value={start} onChange={e => {setStart(e.target.value);setHold('')}} /></label><label>Confirmed shoot ends<input type="date" disabled={busy} min={start || undefined} aria-invalid={Boolean(dateIssue) || undefined} aria-describedby={dateIssue ? 'review-date-issue' : undefined} value={end} onChange={e => {setEnd(e.target.value);setHold('')}} /></label>{dateIssue && <p id="review-date-issue" className="production-error">{dateIssue}</p>}</div><div className="production-review-actions">
      {brief.status === 'submitted' && <><button className="production-primary" disabled={busy || dirty || Boolean(dateIssue)} onClick={() => setPendingAction('approve')}>{hold||start||brief.shootStartsAt||softHoldsFor(brief).length===1?'Approve & confirm dates':'Approve brief'}</button><button className="production-danger" disabled={busy || dirty || !comment.trim()} aria-describedby="review-reason-hint" onClick={() => setPendingAction('deny')}>Deny brief</button></>}
      <button disabled={busy || dirty || !comment.trim()} aria-describedby="review-reason-hint" onClick={() => send('request_changes')}>Request changes</button><button disabled={busy || dirty || Boolean(dateIssue) || (!hold && (!start || !end))} onClick={() => send('schedule')}>{brief.shootStartsAt?'Update confirmed dates':'Confirm shoot date'}</button>
    </div>{!comment.trim() && <p id="review-reason-hint" className="production-muted">Write a reason in the comment box to deny or request changes.</p>}{dirty && <p className="production-muted">Save the draft before taking a review action.</p>}</>}
    {(own || access.canReview) && ['submitted','approved','changes_requested'].includes(brief.status) && <button disabled={busy || dirty} className="production-danger" onClick={() => setPendingAction('withdraw')}>Withdraw request</button>}
    {own && ['denied','withdrawn'].includes(brief.status) && <button disabled={busy} onClick={() => send('reopen')}>Reopen as draft</button>}
  </section>
}
/** Save-bar status text that pulses once after each successful save. */
function SaveStatus({ pulse, onSettled, role, children }: { pulse: number; onSettled: () => void; role?: 'status'; children: ReactNode }) {
  return <span key={pulse} role={role} className={pulse ? 'production-saved-pulse' : undefined} onAnimationEnd={onSettled}>{children}</span>
}
function ProductionSettingsForm({ api, loadMembers, onSaved }: { api: ProductionClient; loadMembers: () => Promise<ApiMember[]>; onSaved: () => Promise<void> }) {
  const [settings,setSettings] = useState<ProductionSettings | null>(null), [saved,setSaved] = useState<ProductionSettings | null>(null), [members,setMembers] = useState<ApiMember[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const [loadError,setLoadError] = useState(''), [attempt,setAttempt] = useState(0), [loadingSettings,setLoadingSettings] = useState(true)
  useEffect(() => { let active = true; setLoadError(''); setLoadingSettings(true); Promise.all([api.settings(),loadMembers()]).then(([s,m]) => { if (active) { setSettings(s); setSaved(s); setMembers(m) } }).catch(e => { if (active) setLoadError(errorText(e)) }).finally(() => { if (active) setLoadingSettings(false) }); return () => { active = false } }, [api,loadMembers,attempt])
  const leadByRole = (m: ApiMember) => ['owner','admin'].includes(m.role)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id))
  const dirty = !!settings && !!saved && (!same(settings.reviewerIds, saved.reviewerIds) || !same(settings.executiveIds, saved.executiveIds))
  const leads = settings ? members.filter(m => leadByRole(m) || settings.reviewerIds.includes(m.id)).length : 0, executives = settings ? members.filter(m => settings.executiveIds.includes(m.id)).length : 0
  const [savedPulse, setSavedPulse] = useState(0)
  const toast = useToast()
  const {pageRows,pagination} = usePagination(members)
  const roleLabel = (m: ApiMember) => m.role === 'owner' ? 'Owner' : m.role === 'admin' ? 'Admin' : null
  return <section className="production-settings production-access" aria-labelledby="production-access-title">
    <div className="production-section-head"><div><h2 id="production-access-title">Production roles</h2><p>Organization administrators decide who leads production and who hears about decisions.</p></div></div>
    {error && <p role="alert" className="production-error">{error}</p>}
    {loadError && !settings ? <LoadError what="Production roles" message={loadError} onRetry={() => setAttempt(n => n + 1)} retrying={loadingSettings} /> : !settings ? <Skeleton label="Loading settings…" variant="row" count={4} /> : <form className="ws-enter" onSubmit={e => { e.preventDefault(); setBusy(true); setError(''); api.saveSettings({ ...settings, approvalConfirmsDates: true }).then(s => { setSettings(s); setSaved(s); setSavedPulse(n => n + 1); toast.success('Production access and notification settings saved.', { id: 'production-settings' }); onSaved().catch(() => toast.error('Settings saved, but the workspace could not reload. Refresh the page to see the change.', { id: 'production-settings-reload' })) }).catch(e => setError(errorText(e))).finally(() => setBusy(false)) }}>
      <dl className="production-roles" aria-label="What each role can do">
        <div><dt>Production Lead</dt><dd>Reviews, approves, confirms dates, requests changes and denies briefs; assigns shoot crews and sees organization booking names and equipment. Owners and administrators always have it.</dd></div>
        <div><dt>Executive Leadership Team</dt><dd>Reads submitted briefs and decisions, and receives decision emails.</dd></div>
        <div><dt>Members</dt><dd>See shared production and bookings.</dd></div>
      </dl>
      <p className="production-footnote">Production Lead does not grant organization administration or permission to change other members’ equipment bookings.</p>
      <fieldset disabled={busy} className="production-team">
        <legend>Team access</legend>{members.length > 0 && <p className="production-count">{leads} Production {leads === 1 ? 'Lead' : 'Leads'}{(()=>{const byRole=members.filter(leadByRole).length;return byRole?` (${byRole} through their owner or admin role)`:''})()} · {executives} on Executive Leadership</p>}
        {members.length ? <div className="production-access-table"><table className="production-table"><thead><tr><th scope="col">Active member</th><th scope="col">Production Lead</th><th scope="col">Executive Leadership Team</th></tr></thead><tbody>{pageRows.map(m => { const name = m.displayName || m.email || m.id, role = roleLabel(m); return <tr key={m.id}>
          <th scope="row"><span className="production-member"><span className="production-member-name">{name}{role && <StatusLabel tone="accent">{role}</StatusLabel>}</span>{m.email && m.email !== name && <span className="production-member-email">{m.email}</span>}</span></th>
          {(['reviewerIds','executiveIds'] as const).map(key => { const locked = key === 'reviewerIds' && leadByRole(m); return <td key={key}><label className="production-check"><input aria-label={`${key === 'reviewerIds' ? 'Production leadership' : 'Executive Leadership Team'}: ${name}`} type="checkbox" disabled={locked} checked={settings[key].includes(m.id) || locked} onChange={e => { setSettings(s => s ? { ...s, [key]: e.target.checked ? [...s[key],m.id] : s[key].filter(id => id !== m.id) } : s) }} />{locked && <span className="production-check-note">Included with {role}</span>}</label></td> })}
        </tr> })}</tbody></table></div> : <p className="production-clients-empty"><span>No active members are available.</span></p>}
        <Pagination label="Team access" pagination={pagination} />
      </fieldset>
      <fieldset className="production-emails">
        <legend>Decision emails</legend>
        <p>Each decision notifies the brief’s author and active Executive Leadership Team members at the verified email addresses on their sign-in accounts. No separate mailing list is needed. Sending starts after the system’s sender address is verified.</p>
        <p>Approval confirms the proposed shoot dates. A month-only estimate needs concrete dates before approval. Equipment bookings are managed separately.</p>
      </fieldset>
      <div className={`production-savebar production-settings-savebar${dirty ? ' is-dirty' : ''}`}><SaveStatus role="status" pulse={dirty ? 0 : savedPulse} onSettled={() => setSavedPulse(0)}>{dirty ? 'Unsaved changes' : 'All changes saved'}</SaveStatus><button type="submit" className="production-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>}
  </section>
}
const decisionCap = 50
function DecisionFeed({ api, briefs, deliveries, deliveriesFailed, access, preview, onOpen, onRefresh }: { api: ProductionClient; briefs: ProductionBrief[]; deliveries: Delivery[]; deliveriesFailed: boolean; access: ProductionAccess; preview: boolean; onOpen: (id: string) => void; onRefresh: () => Promise<void> }) {
  const [events,setEvents] = useState<{ brief: ProductionBrief; event: BriefEvent }[]>([]), [failures,setFailures] = useState(0), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true), [attempt,setAttempt] = useState(0)
  // Only briefs that can carry a decision are read, newest first, and at most 50 of them.
  const decided = useMemo(() => briefs.filter(b => b.submission > 0 && !(b.status === 'submitted' && b.submission === 1)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)), [briefs])
  const shown = useMemo(() => decided.slice(0, decisionCap), [decided])
  // Retried deliveries read as queued until the outbox reloads; a rejected retry shows its real status again.
  const [retried,setRetried] = useState<Set<string>>(() => new Set())
  const [pendingRetry,setPendingRetry] = useState<Delivery | null>(null)
  const toast = useToast()
  useEffect(() => { setRetried(new Set()) }, [deliveries])
  const retry = (id: string) => { setBusy(true); setRetried(v => new Set(v).add(id)); api.retry(id).then(() => { toast.success('Delivery queued to send again.', { id: 'production-delivery' }); return onRefresh() }).catch(e => { setRetried(v => { const next = new Set(v); next.delete(id); return next }); toast.error(errorText(e), { id: 'production-delivery' }) }).finally(() => setBusy(false)) }
  // One brief that fails to load no longer empties the feed: the rest show, with a count of what is missing.
  useEffect(() => { let active = true; setLoading(true); Promise.allSettled(shown.map(b => api.get(b.id))).then(results => { if (!active) return; const loaded = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []); setFailures(results.length - loaded.length); setEvents(loaded.flatMap(brief => brief.events.filter(e => ['approved','denied','changes_requested','withdrawn','scheduled'].includes(e.kind)).map(event => ({ brief,event }))).sort((a,b) => b.event.createdAt.localeCompare(a.event.createdAt))) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [api,shown,attempt])
  const {pageRows,pagination} = usePagination(events)
  return <section className="production-decisions">{pendingRetry && <ConfirmDialog tone="default" title="Retry this delivery?" description={pendingRetry.status === 'uncertain' ? 'This delivery may already have reached its recipient, so retrying could send a duplicate email.' : 'The decision email will be queued to send again.'} confirmLabel="Retry delivery" onCancel={() => setPendingRetry(null)} onConfirm={() => { const id = pendingRetry.id; setPendingRetry(null); retry(id) }} />}<h2>Decisions</h2><p>Review outcomes, reasons, and confirmed dates. {preview ? 'Preview sends no email.' : 'Email delivery is tracked separately from the saved decision.'}</p>{failures > 0 && <Notice kind="error" action={<Button disabled={loading} onClick={() => setAttempt(n => n + 1)}>{loading ? 'Retrying…' : 'Retry'}</Button>}>{failures === shown.length ? 'Decisions couldn’t load.' : `${failures} of ${shown.length} briefs couldn’t load, so their decisions are missing below.`} Check your connection and try again.</Notice>}{deliveriesFailed && <Notice kind="warning">Email delivery status couldn’t load, so delivery lines below may be out of date.</Notice>}{decided.length > decisionCap && <p className="production-muted">Showing decisions from the {decisionCap} most recently updated briefs.</p>}{loading && !events.length && <Skeleton label="Loading decisions…" variant="row" count={3} />}{!loading && !events.length && !failures && <p className="production-empty">No decisions yet. Submitted briefs will appear here after leadership reviews them.</p>}{pageRows.map(({brief,event}) => { const jobs = deliveries.filter(d => d.eventId === event.id).map(d => retried.has(d.id) ? { ...d, status: 'pending' as const } : d); return <article className="production-decision ws-enter" key={event.id}><div><button className="production-row-title" onClick={() => onOpen(brief.id)}>{event.snapshot?.projectName || brief.data.projectName}</button><span className={`production-status status-${event.kind === 'scheduled' ? 'approved' : event.kind}`}>{statusLabel(event.kind)}</span></div>{event.shootStartsAt && <p>Confirmed shoot: {dateLabel(event.shootStartsAt)} – {dateLabel(new Date(Date.parse(event.shootEndsAt!) - 1).toISOString())}</p>}<p>{event.actorName} · {dateTimeLabel(event.createdAt)}</p>{event.comment && <blockquote>{event.comment}</blockquote>}<p>{jobs.length ? `Decision email: ${Object.entries(jobs.reduce<Record<string,number>>((n, d) => { const k = ({sent:'sent',failed:'failed to send',uncertain:'delivery unconfirmed',pending:'waiting to send',sending:'sending'} as Record<string,string>)[d.status] ?? d.status.replaceAll('_',' '); n[k] = (n[k] ?? 0) + 1; return n }, {})).map(([k, count]) => `${count} ${k}`).join(', ')}` : 'No email delivery was queued for this decision.'}</p>{access.canAdminister && jobs.filter(d => ['failed','uncertain'].includes(d.status)).map(d => <button key={d.id} disabled={busy} onClick={() => setPendingRetry(d)}>Retry {d.status} delivery</button>)}</article> })}<Pagination label="Decisions" pagination={pagination} /></section>
}
