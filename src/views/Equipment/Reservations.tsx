'use client'
import {reservationInstants,reservationLocalTime as localTime} from '../../equipment/wallTime'
import { TabPill } from '../../components/workspace/TabPill'
import {Select,Skeleton,Notice,Button,Field} from '../../components/workspace/WorkspaceUI'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import {useUnsavedGuard} from '../../components/workspace/useUnsavedGuard'
import {tabKeys} from '../../components/workspace/tabs'
import {DatabaseApiClientError} from '../../api/database'
import { Pagination } from '../../components/workspace/Pagination'
import { usePagination } from '../../components/workspace/usePagination'
import {useToast} from '../../components/workspace/Toast'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {ClientAccount} from '../../types/production'
import type {FormEvent,KeyboardEvent} from 'react'
import {HiOutlineCalendar,HiOutlineCheck,HiOutlineChevronDown,HiOutlineChevronLeft,HiOutlineChevronRight,HiOutlineClock,HiOutlineExclamationTriangle,HiOutlinePlus,HiOutlineXMark} from 'react-icons/hi2'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentRecord,EquipmentReservation,EquipmentAvailability} from '../../types/equipment'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {equipmentCategories,type EquipmentCategory} from '../../types/database-api'
import {generatedEquipmentCode} from './equipmentCode'
import {PhotoThumbnail} from './EquipmentPhoto'
import {defaultPickup,isMissed} from '../../equipment/reservationTiming'

const HOUR=3600000,DAY=86400000
export const reservationLabel=(r:EquipmentReservation)=>r.status==='cancelled'?'Cancelled':r.fulfillmentStatus==='checked_out'?'Checked out':r.fulfillmentStatus==='returned'?'Returned':isMissed(r)?'Missed pickup':'Reserved'
const isOverdue=(r:EquipmentReservation)=>r.status==='confirmed'&&r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now()
const statusTone=(r:EquipmentReservation)=>isOverdue(r)?'overdue':r.status==='cancelled'?'cancelled':r.fulfillmentStatus==='checked_out'?'out':r.fulfillmentStatus==='returned'?'returned':isMissed(r)?'cancelled':'reserved'
const statusText=(r:EquipmentReservation)=>isOverdue(r)?'Overdue':reservationLabel(r)
const timeLabel=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
const dateLabel=(iso:string)=>new Date(iso).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})
const sameDay=(a:string,b:string)=>new Date(a).toDateString()===new Date(b).toDateString()
const rangeLabel=(start:string,end:string)=>`${dateLabel(start)}, ${timeLabel(start)} → ${sameDay(start,end)?'':`${dateLabel(end)}, `}${timeLabel(end)}`
function dayHeading(iso:string){const d=new Date(iso),today=new Date(),diff=Math.round((new Date(d.toDateString()).getTime()-new Date(today.toDateString()).getTime())/DAY),date=d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});return diff===0?`Today, ${date}`:diff===1?`Tomorrow, ${date}`:date}
function lengthLabel(ms:number){if(!Number.isFinite(ms)||ms<=0)return '—';const days=Math.floor(ms/DAY),hours=Math.round((ms%DAY)/HOUR);return [days&&`${days} day${days>1?'s':''}`,hours&&`${hours} hour${hours>1?'s':''}`].filter(Boolean).join(' ')||'Under an hour'}
const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`

type CachedReservations = { settings: { reservationDays: number }; items: EquipmentRecord[]; bookings: EquipmentReservation[]; clients: ClientAccount[]; canAddClients: boolean; reported?: string[]; degraded?: string[]; limitKnown?: boolean }
/** The server's limit on items in one reservation. */
const MAX_ITEMS=50
type Tab='upcoming'|'out'|'history'
type View={name:'list'}|{name:'detail';id:string}|{name:'new'}|{name:'edit';reservation:EquipmentReservation}
const tabOf=(r:EquipmentReservation):Tab=>r.status==='cancelled'||r.fulfillmentStatus==='returned'||isMissed(r)?'history':r.fulfillmentStatus==='checked_out'?'out':'upcoming'

export default function LiveReservations({create=false}:{create?:boolean}){const context=useLiveOrganization();return context?<ReservationWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} admin={context.admin} create={create}/>:<main className="administration"><h1>Reservations</h1><p>Select an active organization in your account to reserve equipment.</p></main>}

function ReservationWorkspace({api,organizationId,admin,create}:{api:DatabaseApi;organizationId:string;admin:boolean;create:boolean}) {
  const cacheKey = `reservations:${organizationId}`
  const cached = getCached<CachedReservations>(cacheKey)
  const [rows,setRows]=useState<EquipmentReservation[]>(cached?.bookings ?? [])
  const [inventory,setInventory]=useState<EquipmentRecord[]>(cached?.items ?? [])
  const [maxDays,setMaxDays]=useState(cached?.settings.reservationDays ?? 7)
  const [clients,setClients]=useState<ClientAccount[]>(cached?.clients ?? [])
  const [canAddClients,setCanAddClients]=useState(cached?.canAddClients ?? false)
  const [reported,setReported]=useState<string[]>(cached?.reported ?? [])
  // Parts that failed to load and fell back to defaults; the page says so instead of quietly using them.
  const [degraded,setDegraded]=useState<string[]>(cached?.degraded ?? []),[limitKnown,setLimitKnown]=useState(cached?.limitKnown ?? true)
  const [confirmingCancel,setConfirmingCancel]=useState(false),[pendingLeave,setPendingLeave]=useState<(()=>void)|null>(null)
  const flowDirty=useRef(false)
  const [view,setView]=useState<View>(create?{name:'new'}:{name:'list'})
  const [tab,setTab]=useState<Tab>('upcoming')
  const [clientFilter,setClientFilter]=useState('')
  const [equipmentFilter,setEquipmentFilter]=useState('')
  const [search,setSearch]=useState('')
  const [loading,setLoading]=useState(!cached)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const toast=useToast()
  const load=useCallback(async()=>{
    const [settingsRes, itemsRes, bookingsRes, clientsRes, accessRes, reportsRes] = await Promise.allSettled([
      api.accounts(organizationId).settings(),
      allPages(after=>api.inventory(organizationId,{limit:100,after})),
      allPages(after=>api.reservations(organizationId,{limit:100,after})),
      allPages(after=>api.production(organizationId).clients(after)),
      api.production(organizationId).access(),
      allPages(after=>api.reports(organizationId).list(after))
    ])
    if (bookingsRes.status === 'rejected') throw bookingsRes.reason
    if (itemsRes.status === 'rejected') throw itemsRes.reason
    const degraded=[settingsRes.status==='rejected'&&'reservation limits',clientsRes.status==='rejected'&&'client accounts',accessRes.status==='rejected'&&'your permissions'].filter((v):v is string=>Boolean(v))
    return {
      degraded,
      limitKnown: settingsRes.status === 'fulfilled',
      settings: settingsRes.status === 'fulfilled' ? settingsRes.value : { reservationDays: 7 },
      items: itemsRes.status === 'fulfilled' ? itemsRes.value : [],
      bookings: bookingsRes.status === 'fulfilled' ? bookingsRes.value : [],
      clients: clientsRes.status === 'fulfilled' ? clientsRes.value : [],
      // Production leads and administrators add client accounts; the server enforces the same rule.
      canAddClients: accessRes.status === 'fulfilled' && accessRes.value.canReview,
      // Items with an unresolved damage report, flagged in the booking picker.
      reported: reportsRes.status === 'fulfilled' ? [...new Set(reportsRes.value.filter(r=>r.status!=='resolved').map(r=>r.equipmentId))] : []
    }
  },[api,organizationId])
  const accept=useCallback((value:Awaited<ReturnType<typeof load>>)=>{
    setClients(value.clients)
    setCanAddClients(value.canAddClients)
    setReported(value.reported??[])
    setRows(value.bookings)
    setInventory(value.items)
    setMaxDays(value.settings.reservationDays)
    setDegraded(value.degraded)
    setLimitKnown(value.limitKnown)
    setCached(cacheKey, value)
  },[cacheKey])
  const navigation=useRef(0)
  useEffect(()=>{
    let active=true
    const initialNavigation=navigation.current, id=new URLSearchParams(window.location.search).get('reservation')
    load().then(value=>{
      if(!active)return
      accept(value)
      if(navigation.current===initialNavigation&&id&&value.bookings.some(r=>r.id===id))setView({name:'detail',id})
    }).catch(e=>{if(active)setError(equipmentError(e,'load'))}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[load,accept])
  const router=useRouter()
  // The open booking lives in the address (?reservation= or ?new=1), so Back, Forward and refresh return to it.
  const open=(next:View,push=true)=>{navigation.current++;setView(next);if(typeof window==='undefined')return;window.scrollTo?.(0,0);if(!push)return;const url=new URL(window.location.href);url.searchParams.delete('reservation');url.searchParams.delete('new');if(next.name==='detail'||next.name==='edit')url.searchParams.set('reservation',next.name==='edit'?next.reservation.id:next.id);else if(next.name==='new'&&!create)url.searchParams.set('new','1');if(url.href!==window.location.href)window.history.pushState(window.history.state,'',url)}
  const viewFromUrl=useRef<()=>void>(()=>{});viewFromUrl.current=()=>{const params=new URLSearchParams(window.location.search),id=params.get('reservation'),next:View=id&&rows.some(r=>r.id===id)?{name:'detail',id}:params.get('new')||create?{name:'new'}:{name:'list'}
    // Back from a booking in progress asks first, and keeps the flow's address until the person agrees.
    if(flowDirty.current&&(view.name==='new'||view.name==='edit')&&next.name!==view.name){window.history.pushState(window.history.state,'',flowUrl.current);setPendingLeave(()=>()=>{flowDirty.current=false;open(next)});return}
    open(next,false)}
  const flowUrl=useRef('')
  // Each view change moves focus to the new view's heading, so keyboard and screen-reader users keep their place.
  const firstView=useRef(true)
  useEffect(()=>{if(firstView.current){firstView.current=false;return}const target=document.querySelector<HTMLElement>(view.name==='list'?'.rsv-top h1':view.name==='detail'?'.rsv-detail-head h1':'.rsv-flow-bar h1');if(target){target.tabIndex=-1;target.focus()}},[view])
  useEffect(()=>{if(view.name==='new'||view.name==='edit')flowUrl.current=window.location.href},[view])
  useUnsavedGuard(view.name==='new'||view.name==='edit'?flowDirty.current:false,proceed=>setPendingLeave(()=>()=>{flowDirty.current=false;proceed()}))
  const [,rerender]=useState(0)
  const setFlowDirty=useCallback((value:boolean)=>{if(flowDirty.current!==value){flowDirty.current=value;rerender(n=>n+1)}},[])
  useEffect(()=>{const pop=()=>viewFromUrl.current();window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[])
  const clientName=(id?:string|null)=>id?clients.find(c=>c.id===id)?.name??'Client account':'Internal use'
  const overdue=rows.filter(isOverdue),locked=!admin&&overdue.some(r=>!r.readOnly)
  const current=view.name==='detail'?rows.find(r=>r.id===view.id):undefined
  async function refresh(){setError('');setLoading(true);try{accept(await load())}catch(e){setError(equipmentError(e,'load'))}finally{setLoading(false)}}
  function equipmentAdded(item:EquipmentRecord){setInventory(list=>[...list.filter(i=>i.id!==item.id),item]);for(const key of ['inventory','reservations','dashboard','reports','fulfillment','calendar'])invalidateCache(`${key}:${organizationId}`)}
  function clientAdded(client:ClientAccount){setClients(list=>[...list.filter(c=>c.id!==client.id),client]);invalidateCache(`reservations:${organizationId}`);invalidateCache(`production:${organizationId}`)}
  async function saved(row:EquipmentReservation,message='Reservation saved.'){setRows(list=>[row,...list.filter(r=>r.id!==row.id)]);if(create){toast.success(message,{id:'reservation'});invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');router.replace(`/reservations/?reservation=${encodeURIComponent(row.id)}`);return}open({name:'detail',id:row.id});toast.success(message,{id:'reservation'});invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');try{accept(await load())}catch(e){setError(equipmentError(e))}}
  // Optimistic: the booking reads as cancelled at once; the previous booking returns if the server rejects the cancellation.
  async function cancel(){if(!current||busy)return;const previous=current;setBusy(true);setError('');toast.dismiss('reservation');invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');setRows(list=>list.map(r=>r.id===previous.id?{...r,status:'cancelled'}:r))
    let row:EquipmentReservation;try{row=await api.cancelReservation(organizationId,previous.id,previous.version)}catch(e){setRows(list=>list.map(r=>r.id===previous.id?previous:r));toast.error(`The reservation was not cancelled. ${equipmentError(e)}`,{id:'reservation'});setBusy(false);return}
    try{await saved(row,'Reservation cancelled.')}finally{setBusy(false)}}

  const needle=search.trim().toLowerCase()
  const matches=rows.filter(r=>
    (!clientFilter||r.clientAccountId===clientFilter)&&
    (!equipmentFilter||r.equipmentIds.includes(equipmentFilter))&&
    (!needle||r.name.toLowerCase().includes(needle)||r.equipmentIds.some(id=>inventory.find(i=>i.id===id)?.name.toLowerCase().includes(needle))))
  const count=(t:Tab)=>matches.filter(r=>tabOf(r)===t).length
  const anchor=(r:EquipmentReservation)=>tab==='out'?r.endsAt:r.startsAt
  const shown=matches.filter(r=>tabOf(r)===tab).sort((a,b)=>tab==='history'?Date.parse(b.startsAt)-Date.parse(a.startsAt):Date.parse(anchor(a))-Date.parse(anchor(b)))
  const {pageRows,pagination}=usePagination(shown,[organizationId,tab,clientFilter,equipmentFilter,needle])
  const days=[...new Set(pageRows.map(r=>new Date(anchor(r)).toDateString()))]
  const filtered=Boolean(clientFilter||equipmentFilter||needle)

  const leaveDialog=pendingLeave&&<ConfirmDialog title="Discard this reservation?" description="The dates, equipment and name you chose haven’t been saved." confirmLabel="Discard reservation" cancelLabel="Keep reservation" onCancel={()=>setPendingLeave(null)} onConfirm={()=>{const go=pendingLeave;setPendingLeave(null);go()}}/>
  const messages=<>{leaveDialog}{locked&&<p className="rsv-message rsv-message-error" role="alert">Return your overdue equipment before making a new reservation.</p>}{error&&<Notice kind="error" className="rsv-message" action={<Button disabled={loading} onClick={()=>void refresh()}>{loading?'Retrying…':'Retry'}</Button>}>{error}</Notice>}{degraded.length>0&&!error&&<Notice kind="warning" className="rsv-message" action={<Button disabled={loading} onClick={()=>void refresh()}>{loading?'Retrying…':'Retry'}</Button>}>Some details couldn’t load ({degraded.join(', ')}). {degraded.includes('reservation limits')?'The reservation length limit is checked when you save. ':''}Client names and options may be incomplete.</Notice>}</>
  if(view.name==='new'&&(!locked||loading)||view.name==='edit'){
    const reservation=view.name==='edit'?view.reservation:undefined
    return <main className="rsv">{messages}<BookingFlow key={reservation?`${reservation.id}:${reservation.version}`:'new'} api={api} organizationId={organizationId} inventory={inventory} clients={clients} canAddClients={canAddClients} canAddEquipment={admin} reported={reported} onClientAdded={clientAdded} maxDays={maxDays} limitKnown={limitKnown} reservation={reservation} onDirtyChange={setFlowDirty} onClose={()=>{const go=()=>{setFlowDirty(false);open(reservation?{name:'detail',id:reservation.id}:{name:'list'})};if(flowDirty.current)setPendingLeave(()=>go);else go()}} onSaved={row=>saved(row,reservation?'Reservation saved.':'Reservation created.')} onEquipmentAdded={equipmentAdded}/></main>
  }
  if(view.name==='detail'&&current) return <main className="rsv">
    <button type="button" className="rsv-back" onClick={()=>open({name:'list'})}><Chevron dir="left"/>Reservations</button>
    {messages}
    <ReservationDetail api={api} organizationId={organizationId} reservation={current} inventory={inventory} client={clientName(current.clientAccountId)} busy={busy} onEdit={()=>open({name:'edit',reservation:current})} onCancel={()=>setConfirmingCancel(true)}/>
    {confirmingCancel&&<ConfirmDialog title="Cancel this reservation?" subject={current.name} description={`${rangeLabel(current.startsAt,current.endsAt)}, ${plural(current.equipmentIds.length,'item')}. The equipment is released for others to book. This can’t be undone.`} confirmLabel="Cancel reservation" cancelLabel="Keep reservation" busy={busy} returnFocus={()=>document.querySelector<HTMLElement>('.rsv-detail-head h1')} onCancel={()=>setConfirmingCancel(false)} onConfirm={()=>{setConfirmingCancel(false);void cancel()}}/>}
  </main>

  return <main className="rsv">
    <header className="rsv-top"><div><h1>Reservations</h1></div><div className="rsv-top-actions"><Button disabled={loading||busy} aria-busy={loading} onClick={()=>void refresh()}>{loading?'Refreshing…':'Refresh'}</Button><button type="button" className="rsv-button rsv-primary" disabled={locked} onClick={()=>open({name:'new'})}><Plus/>Book gear</button></div></header>
    {messages}
    {overdue.length>0&&<div className="rsv-overdue" role="status"><span aria-hidden="true"/><p>{overdue.length===1?<><b>{overdue[0].name}</b> is overdue. It was due back {dateLabel(overdue[0].endsAt)} at {timeLabel(overdue[0].endsAt)}.</>:<><b>{overdue.length} bookings</b> are overdue.</>}</p><button type="button" className="rsv-link" onClick={()=>overdue.length===1?open({name:'detail',id:overdue[0].id}):setTab('out')}>Review</button></div>}
    {loading&&!rows.length?<Skeleton label="Loading reservations…" variant="row" count={4}/>:!rows.length&&!error?<div className="rsv-empty"><h2>No reservations yet</h2><p>When someone books equipment it shows up here by pickup day, so you always know what goes out and what comes back.</p><button type="button" className="rsv-button rsv-primary" disabled={locked} onClick={()=>open({name:'new'})}><Plus/>Book gear</button></div>:rows.length>0&&<>
      <div className="rsv-tabs ws-pill-tabs" role="tablist" aria-label="Reservations" onKeyDown={tabKeys}><TabPill id="reservations"/>{([['upcoming','Upcoming'],['out','Out now'],['history','History']] as const).filter(([value])=>admin||value!=='history').map(([value,label])=><button type="button" role="tab" key={value} id={`rsv-tab-${value}`} aria-controls="rsv-panel" aria-selected={tab===value} tabIndex={tab===value?0:-1} onClick={()=>setTab(value)}>{label}<span><span className="ws-sr-only">, </span>{count(value)}</span></button>)}</div>
      <div className="rsv-filters" role="group" aria-label="Reservation filters">
        <Field label="Search" className="rsv-filter-search">
          <input type="search" className="rsv-input" value={search} placeholder="Booking or equipment name" onChange={e=>setSearch(e.target.value)}/>
        </Field>
        <Field label="Equipment">
          <Select value={equipmentFilter} onChange={e=>setEquipmentFilter(e.target.value)}>
            <option value="">All equipment</option>
            {inventory.map(i=><option key={i.id} value={i.id}>{i.name} ({i.equipmentCode})</option>)}
          </Select>
        </Field>
        <Field label="Client account">
          <Select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}>
            <option value="">All client accounts</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.deletedAt?' (Deleted)':''}</option>)}
          </Select>
        </Field>
        {filtered&&<button type="button" className="rsv-link" onClick={()=>{setSearch('');setEquipmentFilter('');setClientFilter('')}}>Clear filters</button>}
      </div>
      <div id="rsv-panel" role="tabpanel" aria-labelledby={`rsv-tab-${tab}`}>
      {!shown.length?<div className="rsv-empty rsv-empty-small"><h2>{filtered?'No matching reservations':tab==='upcoming'?'Nothing coming up':tab==='out'?'Nothing is out right now':'No past reservations yet'}</h2><p>{filtered?'Change or clear your filters to see more reservations.':tab==='history'?'Returned, cancelled and missed reservations move here.':'Reservations show up here as soon as they’re made.'}</p></div>
      :days.map(day=><section className="rsv-day" key={day}><h2>{dayHeading(day)}</h2><div className="rsv-rows">{pageRows.filter(r=>new Date(anchor(r)).toDateString()===day).map(r=><button type="button" className="rsv-row" key={r.id} onClick={()=>open({name:'detail',id:r.id})}>
        <span className="rsv-row-time">{tab==='out'?`Due ${timeLabel(r.endsAt)}`:timeLabel(r.startsAt)}</span>
        <span className="rsv-row-main"><b>{r.name}</b><small>{clientName(r.clientAccountId)} ({plural(r.equipmentIds.length,'item')})</small></span>
        <StatusDot reservation={r}/><Chevron dir="right"/></button>)}</div></section>)}
      <Pagination label="Reservations" pagination={pagination}/>
      </div>
    </>}
  </main>
}

type DetailTone='reserved'|'missed'|'out'|'overdue'|'returned'|'cancelled'
const atLabel=(iso:string)=>`${dateLabel(iso)} at ${timeLabel(iso)}`
/** What happened to a reservation, in words, and what the desk can do next. */
function detailState(r:EquipmentReservation,active:boolean):{tone:DetailTone;title:string;body:string}{
  if(r.status==='cancelled')return {tone:'cancelled',title:'Cancelled',body:'This reservation was cancelled. Its equipment is free for others to book.'}
  if(r.fulfillmentStatus==='returned')return {tone:'returned',title:'Returned',body:r.returnedAt?`The equipment came back ${atLabel(r.returnedAt)}.`:'The equipment came back.'}
  if(isOverdue(r))return {tone:'overdue',title:'Overdue',body:`Due back ${atLabel(r.endsAt)}.${active?' Return the equipment, or edit the reservation to extend it.':''}`}
  if(r.fulfillmentStatus==='checked_out')return {tone:'out',title:'Checked out',body:`Due back ${atLabel(r.endsAt)}.`}
  if(isMissed(r))return {tone:'missed',title:'Pickup missed',body:`Nothing was checked out before the window closed ${atLabel(r.endsAt)}.${active?' Reschedule to hold the equipment again, or check it out now if the borrower is at the desk.':''}`}
  return {tone:'reserved',title:'Reserved',body:`Ready for pickup ${atLabel(r.startsAt)}.`}
}
const STATE_ICON:Record<DetailTone,typeof HiOutlineClock>={reserved:HiOutlineCalendar,missed:HiOutlineClock,out:HiOutlineClock,overdue:HiOutlineExclamationTriangle,returned:HiOutlineCheck,cancelled:HiOutlineXMark}

function ReservationDetail({api,organizationId,reservation:r,inventory,client,busy,onEdit,onCancel}:{api:DatabaseApi;organizationId:string;reservation:EquipmentReservation;inventory:EquipmentRecord[];client:string;busy:boolean;onEdit:()=>void;onCancel:()=>void}){
  const active=!r.readOnly&&r.status==='confirmed'&&r.fulfillmentStatus!=='returned'
  const state=detailState(r,active),Icon=STATE_ICON[state.tone],missed=state.tone==='missed'
  const fulfil=`/check-in-out/?reservation=${r.id}`
  const actions=!active?null:missed
    ?<><button type="button" className="rsv-button rsv-primary" onClick={onEdit}>Reschedule</button><Link className="rsv-button" href={fulfil}>Check out now</Link></>
    :<><Link className="rsv-button rsv-primary" href={fulfil}>{r.fulfillmentStatus==='checked_out'?'Return equipment':'Check out'}</Link><button type="button" className="rsv-button" onClick={onEdit}>Edit reservation</button></>
  return <div className="rsv-detail">
    <header className="rsv-detail-head"><h1>{r.name}</h1></header>
    <section className={`rsv-state rsv-state-${state.tone}`} aria-labelledby="rsv-state-title">
      <span className="rsv-state-icon"><Icon aria-hidden="true"/></span>
      <div className="rsv-state-main">
        <div><h2 id="rsv-state-title">{state.title}</h2><p>{state.body}</p></div>
        {actions&&<div className="rsv-actions">{actions}</div>}
      </div>
    </section>
    <section className="rsv-sheet" aria-label="Reservation details">
      <dl className="rsv-when">
        <div><dt>Pickup</dt><dd><span className="rsv-when-time">{timeLabel(r.startsAt)}</span><span>{dateLabel(r.startsAt)}</span>{missed&&<span className="rsv-tag">Missed</span>}{r.checkedOutAt&&<span className="rsv-when-note">Checked out {atLabel(r.checkedOutAt)}</span>}</dd></div>
        <div><dt>Return</dt><dd><span className="rsv-when-time">{timeLabel(r.endsAt)}</span><span>{dateLabel(r.endsAt)}</span>{r.returnedAt&&<span className="rsv-when-note">Returned {atLabel(r.returnedAt)}</span>}</dd></div>
        <div><dt>Length</dt><dd><span className="rsv-when-time">{lengthLabel(Date.parse(r.endsAt)-Date.parse(r.startsAt))}</span></dd></div>
      </dl>
      <div className="rsv-gear-head"><h2>Equipment</h2><span>{plural(r.equipmentIds.length,'item')}</span></div>
      <ul className="rsv-gear">{r.equipmentIds.map(id=>{const item=inventory.find(i=>i.id===id);return <li key={id}>{item?<PhotoThumbnail api={api} organizationId={organizationId} item={item}/>:<span className="inventory-thumb" aria-hidden="true"/>}<span><b>{item?.name??'Equipment item'}</b>{item&&<small>Code {item.equipmentCode}</small>}</span></li>})}</ul>
      <dl className="rsv-client-row"><dt>Client account</dt><dd>{client}</dd></dl>
    </section>
    {active&&r.fulfillmentStatus==='reserved'&&<p className="rsv-detail-foot"><button type="button" className="rsv-button rsv-danger-button" disabled={busy} onClick={onCancel}>Cancel reservation</button></p>}
  </div>
}

const STEPS=['When','Equipment','Details'] as const
function BookingFlow({api,organizationId,inventory,clients,canAddClients,canAddEquipment,reported,onClientAdded,maxDays,limitKnown=true,reservation,onClose,onSaved,onEquipmentAdded,onDirtyChange}:{api:DatabaseApi;organizationId:string;inventory:EquipmentRecord[];clients:ClientAccount[];canAddClients:boolean;canAddEquipment:boolean;reported:string[];onClientAdded:(client:ClientAccount)=>void;maxDays:number;limitKnown?:boolean;reservation?:EquipmentReservation;onClose:()=>void;onSaved:(r:EquipmentReservation)=>Promise<void>;onEquipmentAdded:(item:EquipmentRecord)=>void;onDirtyChange?:(dirty:boolean)=>void}) {
  const [step,setStep]=useState(0)
  // Moving between questions focuses the new question, which reads it out with its step number.
  const question=useRef<HTMLHeadingElement>(null),stepped=useRef(false)
  useEffect(()=>{if(stepped.current)question.current?.focus();stepped.current=true},[step])
  // Re-runs the availability check, e.g. after the server says an item was just booked by someone else.
  const [recheck,setRecheck]=useState(0),[conflict,setConflict]=useState('')
  // Re-evaluates "pickup has passed" as time moves on while the flow is open.
  const [clock,setClock]=useState(Date.now())
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer)},[])
  const [clientId,setClientId]=useState(reservation?.clientAccountId??''),[addingClient,setAddingClient]=useState(false)
  const start=useMemo(()=>defaultPickup().toISOString(),[])
  const [name,setName]=useState(reservation?.name??''),[startsAt,setStartsAt]=useState(localTime(reservation?.startsAt??start)),[endsAt,setEndsAt]=useState(localTime(reservation?.endsAt??new Date(Date.parse(start)+HOUR).toISOString())),[ids,setIds]=useState(reservation?.equipmentIds??[]),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[availabilityError,setAvailabilityError]=useState(''),[showUnavailable,setShowUnavailable]=useState(false),[search,setSearch]=useState('')
  const [startChoice,setStartChoice]=useState(''),[endChoice,setEndChoice]=useState('')
  const mutation=useRef<{key:string;id:string}|null>(null),lifecycle=useMemo(()=>api.equipment(organizationId),[api,organizationId])
  const pickupOptions=reservationInstants(startsAt,reservation?.startsAt)
  const returnOptions=reservationInstants(endsAt,reservation?.endsAt)
  const pickup=pickupOptions.length===1?pickupOptions[0]:startChoice
  const dropoff=returnOptions.length===1&&!(endChoice&&localTime(endChoice)===endsAt)?returnOptions[0]:endChoice
  const length=Date.parse(dropoff)-Date.parse(pickup)
  // The server refuses any pickup before now; `clock` re-checks it while the flow stays open.
  const past=Date.parse(pickup)<clock&&(!reservation||Date.parse(pickup)!==Date.parse(reservation.startsAt))
  const valid=Number.isFinite(length)&&length>0&&(!limitKnown||length<=maxDays*DAY)&&!past
  const initial=useRef({name,startsAt,endsAt,ids:[...ids].sort().join(),clientId})
  const touched=name!==initial.current.name||startsAt!==initial.current.startsAt||endsAt!==initial.current.endsAt||[...ids].sort().join()!==initial.current.ids||clientId!==initial.current.clientId
  useEffect(()=>{onDirtyChange?.(touched)},[touched,onDirtyChange])
  useEffect(()=>()=>onDirtyChange?.(false),[onDirtyChange])
  useEffect(()=>{let active=true;setChecking(true);setAvailabilityError('');if(!valid){setChecking(false);return}const timer=setTimeout(()=>{allPages(after=>lifecycle.availability(pickup,dropoff,after)).then(rows=>{if(active)setAvailability(rows)}).catch(e=>{if(active)setAvailabilityError(equipmentError(e))}).finally(()=>{if(active)setChecking(false)})},300);return()=>{active=false;clearTimeout(timer)}},[lifecycle,pickup,dropoff,valid,recheck])
  const blocked=new Set(availability.filter(r=>r.id!==reservation?.id).flatMap(r=>r.equipmentIds))
  const why=(i:EquipmentRecord)=>blocked.has(i.id)?'Reserved during these dates':i.status!=='available'?`Not available (${i.status==='retired'?'archived':i.status.replace(/_/g,' ')})`:''
  const unavailable=ids.some(id=>{const i=inventory.find(x=>x.id===id);return !i||Boolean(why(i))}),out=reservation?.fulfillmentStatus==='checked_out'
  function setReturnFromInstant(instant:string){setEndsAt(localTime(instant));setEndChoice(instant)}
  function moveReturn(instant:string){
    const keep=Number.isFinite(length)&&length>0&&length<=maxDays*DAY?length:HOUR
    setReturnFromInstant(new Date(Date.parse(instant)+keep).toISOString())
  }
  function changeStart(value:string){
    setStartsAt(value);setStartChoice('')
    const choices=reservationInstants(value,reservation?.startsAt)
    if(choices.length===1)moveReturn(choices[0])
  }
  const occurrence=(label:string,choices:string[],choice:string,update:(value:string)=>void)=>choices.length>1&&
    <label className="rsv-field">{label}<Select value={choice} onChange={event=>update(event.target.value)} required>
      <option value="">Choose which occurrence</option>
      {choices.map((instant,index)=><option key={instant} value={instant}>{index===0?'Earlier occurrence':'Later occurrence'} ({new Date(instant).toLocaleTimeString(undefined,{timeZoneName:'short'})})</option>)}
    </Select></label>

  const presets=([['2 hours',2*HOUR],['Half day',4*HOUR],['Full day',DAY],['3 days',3*DAY],[`${maxDays} days`,maxDays*DAY]] as const).filter(([,ms],i,all)=>ms<=maxDays*DAY&&all.findIndex(p=>p[1]===ms)===i)
  const canContinue=[valid,valid&&ids.length>0&&!unavailable&&!checking&&!availabilityError,name.trim().length>0][step]
  async function submit(e:FormEvent){e.preventDefault();if(step<2){if(canContinue)setStep(step+1);return}if(busy||checking||!valid||unavailable||!ids.length||!name.trim())return;setBusy(true);setError('');try{const value={clientAccountId:clientId||null,name:name.trim(),startsAt:pickup,endsAt:dropoff,equipmentIds:[...ids].sort()},key=JSON.stringify({...value,version:reservation?.version});if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};const input={...value,requestId:mutation.current.id},row=reservation?await lifecycle.edit(reservation.id,{...input,version:reservation.version}):await api.createReservation(organizationId,input);mutation.current=null;onDirtyChange?.(false);await onSaved(row)}catch(e){
      // Someone else booked an item in the meantime: go back to equipment with fresh availability, keeping everything else.
      if(e instanceof DatabaseApiClientError&&e.status===409){mutation.current=null;setStep(1);setRecheck(n=>n+1);setConflict('One or more items were just booked by someone else for these dates. They’re marked below; choose a replacement, then continue.');return}
      setError(equipmentError(e))}finally{setBusy(false)}}
  const needle=search.trim().toLowerCase()
  const listed=inventory.filter(i=>!needle||i.name.toLowerCase().includes(needle)||i.equipmentCode.toLowerCase().includes(needle))
  const free=listed.filter(i=>!why(i)||ids.includes(i.id)),taken=listed.filter(i=>why(i)&&!ids.includes(i.id))
  const full=ids.length>=MAX_ITEMS
  const item=(i:EquipmentRecord)=>{const reason=why(i);return <label className={`rsv-item${reason&&!ids.includes(i.id)?' is-off':''}`} key={i.id}><input type="checkbox" className="rsv-check" checked={ids.includes(i.id)} disabled={(Boolean(reason)||full)&&!ids.includes(i.id)} onChange={e=>{setConflict('');setIds(current=>e.target.checked?[...current,i.id]:current.filter(id=>id!==i.id))}}/><span className="rsv-item-main"><b>{i.name}</b><small>{i.equipmentCode}, {i.category}{i.checkedOut?', currently checked out':''}{reported.includes(i.id)?', has an open damage report':''}</small></span>{reason&&<span className="rsv-item-why">{reason}</span>}</label>}
  const summary=step===0?(valid?`${dateLabel(pickup)} for ${lengthLabel(length)}`:''):step===1?(ids.length?`${ids.length} of ${MAX_ITEMS} items selected`:'Pick at least one item'):''
  return <form className="rsv-flow" onSubmit={submit} aria-label={reservation?'Edit reservation':'New reservation'}>
    <div className="rsv-flow-bar"><button type="button" className="rsv-button rsv-quiet" onClick={onClose}><CloseIcon/><span className="rsv-flow-exit-label">{reservation?'Discard changes':'Discard reservation'}</span></button><h1>{reservation?'Edit reservation':'New reservation'}</h1><span className="rsv-flow-step" id="rsv-flow-step">Step {step+1} of {STEPS.length}</span></div>
    <div className="rsv-progress" aria-hidden="true"><i style={{width:`${(step+1)/STEPS.length*100}%`}}/></div>
    <fieldset className="rsv-flow-body" disabled={busy}>
      {step===0&&<div className="rsv-question"><h2 ref={question} tabIndex={-1} aria-describedby="rsv-flow-step">When do you need it?</h2><p>{limitKnown?`Up to ${plural(maxDays,'day')}.`:'The length limit couldn’t load; it’s checked when you save.'} Times use your device’s local time zone.{out?' Checked-out reservations keep their pickup time and equipment.':''}</p>
        <div className="rsv-pair"><label className="rsv-field">Pick up<input className="rsv-input" type="datetime-local" aria-invalid={!valid||undefined} aria-describedby={!valid?'rsv-date-error':undefined} value={startsAt} min={out?undefined:localTime(new Date(clock).toISOString())} disabled={out} onChange={e=>changeStart(e.target.value)} required/></label><label className="rsv-field">Return<input className="rsv-input" type="datetime-local" aria-invalid={!valid||undefined} aria-describedby={!valid?'rsv-date-error':undefined} value={endsAt} onChange={e=>{setEndsAt(e.target.value);setEndChoice('')}} required/></label></div>
        <div className="rsv-pair">{occurrence('Pickup time occurrence',pickupOptions,startChoice,value=>{setStartChoice(value);if(value)moveReturn(value)})}{occurrence('Return time occurrence',returnOptions,endChoice,setEndChoice)}</div>
        <div className="rsv-chips" role="group" aria-label="Quick lengths">{presets.map(([label,ms])=><button type="button" key={label} aria-pressed={length===ms} onClick={()=>setReturnFromInstant(new Date(Date.parse(pickup)+ms).toISOString())} disabled={!pickup}>{label}</button>)}</div>
        <p className="rsv-length"><span>Length</span><b>{lengthLabel(length)}</b></p>
        {!valid&&<p className="rsv-inline-error" id="rsv-date-error" role="alert">{past?'Choose a pickup time that hasn’t passed yet.':startsAt&&!pickupOptions.length||endsAt&&!returnOptions.length?'That local time does not exist. Choose a different time.':!pickup||!dropoff?'Choose the occurrence for each repeated local time.':`Choose a return time after pickup, within ${plural(maxDays,'day')}.`}</p>}
      </div>}
      {step===1&&<div className="rsv-question"><h2 ref={question} tabIndex={-1} aria-describedby="rsv-flow-step">What are you taking?</h2><p>{valid?`Showing what’s free ${rangeLabel(pickup,dropoff)}.`:''}</p>
        {conflict&&<p className="rsv-inline-error" role="alert">{conflict}</p>}{checking&&<p className="rsv-hint" role="status">Checking availability…</p>}{availabilityError&&<p className="rsv-inline-error" role="alert">{availabilityError}</p>}{full&&<p className="rsv-hint" role="status">A reservation holds up to {MAX_ITEMS} items. Make a second reservation for the rest.</p>}
        {out?<><p className="rsv-hint">This reservation is checked out, so its equipment can’t change.</p><ul className="rsv-items">{ids.map(id=><li className="rsv-item" key={id}><span className="rsv-item-main"><b>{inventory.find(i=>i.id===id)?.name??'Equipment item'}</b></span></li>)}</ul></>:<>
          {inventory.length>0&&<label className="rsv-field rsv-search"><span className="ws-sr-only">Search equipment</span><input className="rsv-input" value={search} placeholder="Search by name or code" onChange={e=>setSearch(e.target.value)}/></label>}
          {inventory.length>0&&<div className="rsv-items">{free.map(item)}{!free.length&&<p className="rsv-hint">{needle?'Nothing free matches that search.':'Nothing is free for these dates. Try different dates.'}</p>}</div>}
          {taken.length>0&&<div className="rsv-taken"><button type="button" className="rsv-disclosure" aria-expanded={showUnavailable} onClick={()=>setShowUnavailable(v=>!v)}><Chevron dir={showUnavailable?'down':'right'}/>Not available for these dates ({taken.length})</button>{showUnavailable&&<div className="rsv-items">{taken.map(item)}</div>}</div>}
          {canAddEquipment&&<QuickAddEquipment api={api} organizationId={organizationId} startOpen={!inventory.length} onAdded={added=>{onEquipmentAdded(added);setIds(current=>[...current,added.id])}}/>}
          {unavailable&&<p className="rsv-inline-error" role="alert">Selected equipment is unavailable. Choose another item or go back and change the dates.</p>}
        </>}
      </div>}
      {step===2&&<div className="rsv-question"><h2 ref={question} tabIndex={-1} aria-describedby="rsv-flow-step">Name this reservation</h2><p>Something your team will recognize on the list.</p>
        <div className="rsv-stack"><label className="rsv-field">Reservation name<input className="rsv-input" value={name} maxLength={120} placeholder="e.g. Spring reel b-roll" onChange={e=>setName(e.target.value)} required/></label>
        <div className="rsv-client"><label className="rsv-field">Client account<Select value={addingClient?NEW_CLIENT:clientId} onChange={e=>{if(e.target.value===NEW_CLIENT)setAddingClient(true);else{setAddingClient(false);setClientId(e.target.value)}}}><option value="">No client (internal use)</option>{clients.filter(c=>!c.deletedAt||c.id===clientId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}{canAddClients&&<option value={NEW_CLIENT}>+ Add a new client account…</option>}</Select></label>
        {addingClient&&<NewClientAccount api={api} organizationId={organizationId} onCancel={()=>setAddingClient(false)} onAdded={client=>{onClientAdded(client);setClientId(client.id);setAddingClient(false)}}/>}</div></div>
        <dl className="rsv-review"><div><dt>When</dt><dd>{valid?rangeLabel(pickup,dropoff):'—'}</dd><button type="button" className="rsv-link" onClick={()=>setStep(0)}>Change<span className="ws-sr-only"> dates</span></button></div>
          <div><dt>Equipment</dt><dd>{ids.map(id=><span key={id}>{inventory.find(i=>i.id===id)?.name??'Equipment item'}</span>)}</dd><button type="button" className="rsv-link" onClick={()=>setStep(1)}>Change<span className="ws-sr-only"> equipment</span></button></div></dl>
        {error&&<p className="rsv-inline-error" role="alert">{error}</p>}
      </div>}
    </fieldset>
    <div className="rsv-flow-foot"><div>
      {step>0&&<button type="button" className="rsv-button rsv-quiet" disabled={busy} onClick={()=>setStep(step-1)}><Chevron dir="left"/>Back</button>}
      <span className="rsv-flow-summary">{summary}</span>
      <button type="submit" className="rsv-button rsv-primary" disabled={busy||!canContinue||step===2&&(checking||unavailable||!ids.length||!valid)}>{step<2?'Continue':busy?'Saving reservation…':reservation?'Save reservation':'Create reservation'}</button>
    </div></div>
  </form>
}

const NEW_CLIENT='__new_client__'
/** Creates a client account without leaving the booking, then selects it. Not a nested <form>, so Enter is handled here. */
function NewClientAccount({api,organizationId,onAdded,onCancel}:{api:DatabaseApi;organizationId:string;onAdded:(client:ClientAccount)=>void;onCancel:()=>void}){
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),toast=useToast()
  async function add(){if(busy)return;const value=name.trim().replace(/\s+/g,' ');if(!value){setError('Enter a name for the client account.');return}setBusy(true);setError('');try{const client=await api.production(organizationId).createClient(value);onAdded(client);toast.success(`${client.name} added and selected.`,{id:'reservation-client'})}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <div className="rsv-add rsv-add-client" role="group" aria-label="Add a client account"><label className="rsv-field">New client account<input className="rsv-input" value={name} maxLength={160} disabled={busy} placeholder="e.g. Southside Coffee Co." autoFocus onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void add()}}}/></label>
    <p className="rsv-hint">It’s added for your whole organization and selected for this reservation.</p>
    {error&&<p className="rsv-inline-error" role="alert">{error}</p>}
    <div className="rsv-add-actions"><button type="button" className="rsv-button" disabled={busy} onClick={()=>void add()}><Plus/>{busy?'Adding client account…':'Add client account'}</button><button type="button" className="rsv-button rsv-quiet" disabled={busy} onClick={onCancel}>Cancel</button></div></div>
}

/** Lets any member add an item, in any category, without leaving the booking. It is not a nested <form>, so Enter is handled here instead of submitting the reservation. */
function QuickAddEquipment({api,organizationId,startOpen,onAdded}:{api:DatabaseApi;organizationId:string;startOpen:boolean;onAdded:(item:EquipmentRecord)=>void}) {
  const [open,setOpen]=useState(startOpen),[name,setName]=useState(''),[category,setCategory]=useState<EquipmentCategory>(equipmentCategories[0]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  async function add(){if(busy)return;const trimmed=name.trim();if(!trimmed){setError('Enter a name for the equipment.');return}setBusy(true);setError('');setNotice('');try{const item=await api.createEquipment(organizationId,{equipmentCode:generatedEquipmentCode(category),name:trimmed,category});onAdded(item);setName('');setNotice(`${item.name} added and selected.`)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  function enter(e:KeyboardEvent){if(e.key==='Enter'){e.preventDefault();void add()}}
  if(!open)return <div className="rsv-add-closed">{notice&&<p className="rsv-hint" role="status">{notice}</p>}<button type="button" className="rsv-link" onClick={()=>{setOpen(true);setNotice('')}}>Can’t find it? Add equipment</button></div>
  return <div className="rsv-add" role="group" aria-label="Add equipment">{startOpen&&<p className="rsv-hint">Your organization has no equipment yet. Add an item and it’s selected for this reservation.</p>}
    <div className="rsv-pair rsv-add-fields"><label className="rsv-field">Equipment name<input className="rsv-input" value={name} maxLength={120} disabled={busy} placeholder="e.g. Sony FX3 kit" onChange={e=>setName(e.target.value)} onKeyDown={enter}/></label><label className="rsv-field">Category<Select value={category} disabled={busy} onChange={e=>setCategory(e.target.value as EquipmentCategory)}>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</Select></label></div>
    <p className="rsv-hint">A label code is generated for you. Add a photo or print the QR label later from Equipment.</p>
    {error&&<p className="rsv-inline-error" role="alert">{error}</p>}{notice&&<p className="rsv-hint" role="status">{notice}</p>}
    <div className="rsv-add-actions"><button type="button" className="rsv-button" disabled={busy} onClick={()=>void add()}><Plus/>{busy?'Adding equipment…':'Add and select'}</button>{!startOpen&&<button type="button" className="rsv-button rsv-quiet" disabled={busy} onClick={()=>setOpen(false)}>Close add equipment</button>}</div></div>
}

function StatusDot({reservation}:{reservation:EquipmentReservation}){return <span className={`rsv-status rsv-status-${statusTone(reservation)}`}>{statusText(reservation)}</span>}
// One icon family across the app: Heroicons outline (react-icons/hi2).
const Plus=()=><HiOutlinePlus className="rsv-icon" aria-hidden="true"/>
const CloseIcon=()=><HiOutlineXMark className="rsv-icon" aria-hidden="true"/>
const Chevron=({dir}:{dir:'left'|'right'|'down'})=>dir==='left'?<HiOutlineChevronLeft className="rsv-icon" aria-hidden="true"/>:dir==='down'?<HiOutlineChevronDown className="rsv-icon" aria-hidden="true"/>:<HiOutlineChevronRight className="rsv-icon" aria-hidden="true"/>
