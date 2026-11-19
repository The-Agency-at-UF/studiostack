'use client'
import {Select,Skeleton} from '../../components/workspace/WorkspaceUI'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {ClientAccount} from '../../types/production'
import type {FormEvent,KeyboardEvent,ReactNode} from 'react'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentRecord,EquipmentReservation,EquipmentAvailability} from '../../types/equipment'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {equipmentCategories,type EquipmentCategory} from '../../types/database-api'
import {generatedEquipmentCode} from './equipmentCode'
import '../Accounts/Administration.css'
import './Equipment.css'
import './Reservations.css'

const HOUR=3600000,DAY=86400000
const localTime=(iso:string)=>{const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export const reservationLabel=(r:EquipmentReservation)=>r.status==='cancelled'?'Cancelled':r.fulfillmentStatus==='checked_out'?'Checked out':r.fulfillmentStatus==='returned'?'Returned':'Reserved'
const isOverdue=(r:EquipmentReservation)=>r.status==='confirmed'&&r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now()
const statusTone=(r:EquipmentReservation)=>isOverdue(r)?'overdue':r.status==='cancelled'?'cancelled':r.fulfillmentStatus==='checked_out'?'out':r.fulfillmentStatus==='returned'?'returned':'reserved'
const statusText=(r:EquipmentReservation)=>isOverdue(r)?'Overdue':reservationLabel(r)
const timeLabel=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})
const dateLabel=(iso:string)=>new Date(iso).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})
const sameDay=(a:string,b:string)=>new Date(a).toDateString()===new Date(b).toDateString()
const rangeLabel=(start:string,end:string)=>`${dateLabel(start)}, ${timeLabel(start)} → ${sameDay(start,end)?'':`${dateLabel(end)}, `}${timeLabel(end)}`
function dayHeading(iso:string){const d=new Date(iso),today=new Date(),diff=Math.round((new Date(d.toDateString()).getTime()-new Date(today.toDateString()).getTime())/DAY),date=d.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});return diff===0?`Today, ${date}`:diff===1?`Tomorrow, ${date}`:date}
function lengthLabel(ms:number){if(!Number.isFinite(ms)||ms<=0)return '—';const days=Math.floor(ms/DAY),hours=Math.round((ms%DAY)/HOUR);return [days&&`${days} day${days>1?'s':''}`,hours&&`${hours} hour${hours>1?'s':''}`].filter(Boolean).join(' ')||'Under an hour'}
const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`

type CachedReservations = { settings: { reservationDays: number }; items: EquipmentRecord[]; bookings: EquipmentReservation[]; clients: ClientAccount[]; canAddClients: boolean }
type Tab='upcoming'|'out'|'history'
type View={name:'list'}|{name:'detail';id:string}|{name:'new'}|{name:'edit';id:string}
const tabOf=(r:EquipmentReservation):Tab=>r.status==='cancelled'||r.fulfillmentStatus==='returned'?'history':r.fulfillmentStatus==='checked_out'?'out':'upcoming'

export default function LiveReservations({create=false}:{create?:boolean}){const context=useLiveOrganization();return context?<ReservationWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} admin={context.admin} create={create}/>:<main className="administration"><h1>Reservations</h1><p>Select an active organization in your account to reserve equipment.</p></main>}

function ReservationWorkspace({api,organizationId,admin,create}:{api:DatabaseApi;organizationId:string;admin:boolean;create:boolean}) {
  const cacheKey = `reservations:${organizationId}`
  const cached = getCached<CachedReservations>(cacheKey)
  const [rows,setRows]=useState<EquipmentReservation[]>(cached?.bookings ?? [])
  const [inventory,setInventory]=useState<EquipmentRecord[]>(cached?.items ?? [])
  const [maxDays,setMaxDays]=useState(cached?.settings.reservationDays ?? 7)
  const [clients,setClients]=useState<ClientAccount[]>(cached?.clients ?? [])
  const [canAddClients,setCanAddClients]=useState(cached?.canAddClients ?? false)
  const [view,setView]=useState<View>(create?{name:'new'}:{name:'list'})
  const [tab,setTab]=useState<Tab>('upcoming')
  const [clientFilter,setClientFilter]=useState('')
  const [search,setSearch]=useState('')
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [loading,setLoading]=useState(!cached)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const load=useCallback(async()=>{
    const [settingsRes, itemsRes, bookingsRes, clientsRes, accessRes] = await Promise.allSettled([
      api.accounts(organizationId).settings(),
      allPages(after=>api.inventory(organizationId,{limit:100,after})),
      allPages(after=>api.reservations(organizationId,{limit:100,after})),
      allPages(after=>api.production(organizationId).clients(after)),
      api.production(organizationId).access()
    ])
    if (bookingsRes.status === 'rejected') throw bookingsRes.reason
    if (itemsRes.status === 'rejected') throw itemsRes.reason
    return {
      settings: settingsRes.status === 'fulfilled' ? settingsRes.value : { reservationDays: 7 },
      items: itemsRes.status === 'fulfilled' ? itemsRes.value : [],
      bookings: bookingsRes.status === 'fulfilled' ? bookingsRes.value : [],
      clients: clientsRes.status === 'fulfilled' ? clientsRes.value : [],
      // Production leads and administrators add client accounts; the server enforces the same rule.
      canAddClients: accessRes.status === 'fulfilled' && accessRes.value.canReview
    }
  },[api,organizationId])
  const accept=useCallback((value:Awaited<ReturnType<typeof load>>)=>{
    setClients(value.clients)
    setCanAddClients(value.canAddClients)
    setRows(value.bookings)
    setInventory(value.items)
    setMaxDays(value.settings.reservationDays)
    setCached(cacheKey, value)
  },[cacheKey])
  useEffect(()=>{let active=true;load().then(value=>{if(active){accept(value);const id=new URLSearchParams(window.location.search).get('reservation');if(id&&value.bookings.some(r=>r.id===id))setView({name:'detail',id})}}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,accept])
  const open=(next:View)=>{setView(next);setNotice('');setFiltersOpen(false);if(typeof window!=='undefined')window.scrollTo?.(0,0)}
  const clientName=(id?:string|null)=>id?clients.find(c=>c.id===id)?.name??'Client account':'Internal use'
  const overdue=rows.filter(isOverdue),locked=!admin&&overdue.some(r=>!r.readOnly)
  const current=view.name==='detail'||view.name==='edit'?rows.find(r=>r.id===view.id):undefined
  async function refresh(){setError('');setLoading(true);try{accept(await load())}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
  function equipmentAdded(item:EquipmentRecord){setInventory(list=>[...list.filter(i=>i.id!==item.id),item]);for(const key of ['inventory','reservations','dashboard','reports','fulfillment','calendar'])invalidateCache(`${key}:${organizationId}`)}
  function clientAdded(client:ClientAccount){setClients(list=>[...list.filter(c=>c.id!==client.id),client]);invalidateCache(`reservations:${organizationId}`);invalidateCache(`production:${organizationId}`)}
  async function saved(row:EquipmentReservation,message='Reservation saved.'){setRows(list=>[row,...list.filter(r=>r.id!==row.id)]);setView({name:'detail',id:row.id});setNotice(message);invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');try{accept(await load())}catch(e){setError(equipmentError(e))}}
  // Optimistic: the booking reads as cancelled at once; the previous booking returns if the server rejects the cancellation.
  async function cancel(){if(!current||busy)return;const previous=current;setBusy(true);setError('');setNotice('');invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');setRows(list=>list.map(r=>r.id===previous.id?{...r,status:'cancelled'}:r))
    let row:EquipmentReservation;try{row=await api.cancelReservation(organizationId,previous.id)}catch(e){setRows(list=>list.map(r=>r.id===previous.id?previous:r));setError(equipmentError(e));setBusy(false);return}
    try{await saved(row,'Reservation cancelled.')}finally{setBusy(false)}}

  const messages=<>{locked&&<p className="rsv-message rsv-message-error" role="alert">Return your overdue equipment before making a new reservation.</p>}{error&&<p className="rsv-message rsv-message-error" role="alert">{error}</p>}{notice&&<p className="rsv-message" role="status">{notice}</p>}</>
  if(view.name==='new'&&(!locked||loading)||view.name==='edit'&&current){
    const reservation=view.name==='edit'?current:undefined
    return <main className="rsv">{messages}<BookingFlow key={reservation?`${reservation.id}:${reservation.version}`:'new'} api={api} organizationId={organizationId} inventory={inventory} clients={clients} canAddClients={canAddClients} onClientAdded={clientAdded} maxDays={maxDays} reservation={reservation} onClose={()=>open(reservation?{name:'detail',id:reservation.id}:{name:'list'})} onSaved={row=>saved(row,reservation?'Reservation saved.':'Reservation created.')} onEquipmentAdded={equipmentAdded}/></main>
  }
  if(view.name==='detail'&&current) return <main className="rsv"><div className="rsv-column">
    <button type="button" className="rsv-back" onClick={()=>open({name:'list'})}><Chevron dir="left"/>Reservations</button>
    {messages}
    <ReservationDetail reservation={current} inventory={inventory} client={clientName(current.clientAccountId)} busy={busy} onEdit={()=>open({name:'edit',id:current.id})} onCancel={()=>void cancel()}/>
  </div></main>

  const needle=search.trim().toLowerCase()
  const matches=rows.filter(r=>(!clientFilter||r.clientAccountId===clientFilter)&&(!needle||r.name.toLowerCase().includes(needle)||r.equipmentIds.some(id=>inventory.find(i=>i.id===id)?.name.toLowerCase().includes(needle))))
  const count=(t:Tab)=>matches.filter(r=>tabOf(r)===t).length
  const anchor=(r:EquipmentReservation)=>tab==='out'?r.endsAt:r.startsAt
  const shown=matches.filter(r=>tabOf(r)===tab).sort((a,b)=>tab==='history'?Date.parse(b.startsAt)-Date.parse(a.startsAt):Date.parse(anchor(a))-Date.parse(anchor(b)))
  const days=[...new Set(shown.map(r=>new Date(anchor(r)).toDateString()))]
  const filtered=Boolean(clientFilter||needle)
  return <main className="rsv"><div className="rsv-column">
    <header className="rsv-top"><div><h1>Reservations</h1><p>What’s going out, and what’s coming back.</p></div><div className="rsv-top-actions"><button type="button" className="rsv-button rsv-quiet" disabled={loading||busy} onClick={()=>void refresh()}>Refresh</button><button type="button" className="rsv-button rsv-primary" disabled={locked} onClick={()=>open({name:'new'})}><Plus/>New reservation</button></div></header>
    {messages}
    {overdue.length>0&&<div className="rsv-overdue" role="status"><span aria-hidden="true"/><p>{overdue.length===1?<><b>{overdue[0].name}</b> is overdue. It was due back {dateLabel(overdue[0].endsAt)} at {timeLabel(overdue[0].endsAt)}.</>:<><b>{overdue.length} bookings</b> are overdue.</>}</p><button type="button" className="rsv-link" onClick={()=>overdue.length===1?open({name:'detail',id:overdue[0].id}):setTab('out')}>Review</button></div>}
    {loading&&!rows.length?<Skeleton label="Loading reservations…" variant="row" count={4}/>:!rows.length&&!error?<div className="rsv-empty"><h2>No reservations yet</h2><p>When someone books equipment it shows up here by pickup day, so you always know what goes out and what comes back.</p><button type="button" className="rsv-button rsv-primary" disabled={locked} onClick={()=>open({name:'new'})}><Plus/>New reservation</button></div>:rows.length>0&&<>
      <div className="rsv-bar">
        <div className="rsv-tabs" role="tablist" aria-label="Reservations">{([['upcoming','Upcoming'],['out','Out now'],['history','History']] as const).filter(([value])=>admin||value!=='history').map(([value,label])=><button type="button" role="tab" key={value} aria-selected={tab===value} onClick={()=>setTab(value)}>{label}{value!=='history'&&<span>{count(value)}</span>}</button>)}</div>
        <div className="rsv-filter"><button type="button" className="rsv-button rsv-quiet" aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(o=>!o)}><FilterIcon/>Filter{filtered&&<span className="rsv-filter-dot">On</span>}</button>
          {filtersOpen&&<div className="rsv-filter-pop"><label className="rsv-field">Search<input className="rsv-input" value={search} placeholder="Booking or equipment name" onChange={e=>setSearch(e.target.value)}/></label><label className="rsv-field">Client account<Select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="">All client accounts</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.deletedAt?' · Deleted':''}</option>)}</Select></label>{filtered&&<button type="button" className="rsv-link" onClick={()=>{setSearch('');setClientFilter('')}}>Clear filters</button>}</div>}
        </div>
      </div>
      {!shown.length?<div className="rsv-empty rsv-empty-small"><h2>{filtered?'No matching reservations':tab==='upcoming'?'Nothing coming up':tab==='out'?'Nothing is out right now':'No past bookings yet'}</h2><p>{filtered?'Try a different search or client account.':tab==='history'?'Returned and cancelled reservations move here.':'Bookings show up here as soon as they’re made.'}</p></div>
      :days.map(day=><section className="rsv-day" key={day}><h2>{dayHeading(day)}</h2><div className="rsv-rows">{shown.filter(r=>new Date(anchor(r)).toDateString()===day).map(r=><button type="button" className="rsv-row" key={r.id} onClick={()=>open({name:'detail',id:r.id})}>
        <span className="rsv-row-time">{tab==='out'?`Due ${timeLabel(r.endsAt)}`:timeLabel(r.startsAt)}</span>
        <span className="rsv-row-main"><b>{r.name}</b><small>{clientName(r.clientAccountId)} · {plural(r.equipmentIds.length,'item')}</small></span>
        <StatusDot reservation={r}/><Chevron dir="right"/></button>)}</div></section>)}
    </>}
  </div></main>
}

function ReservationDetail({reservation:r,inventory,client,busy,onEdit,onCancel}:{reservation:EquipmentReservation;inventory:EquipmentRecord[];client:string;busy:boolean;onEdit:()=>void;onCancel:()=>void}){
  const active=!r.readOnly&&r.status==='confirmed'&&r.fulfillmentStatus!=='returned'
  return <>
    <header className="rsv-detail-head"><div><StatusDot reservation={r}/><h1>{r.name}</h1><p>{client}</p></div>
      {active&&<div className="rsv-top-actions"><button type="button" className="rsv-button" onClick={onEdit}>Edit reservation</button><Link className="rsv-button rsv-primary" href={`/check-in-out/?reservation=${r.id}`}>{r.fulfillmentStatus==='checked_out'?'Return equipment':'Check out'}</Link></div>}</header>
    {isOverdue(r)&&<p className="rsv-alert">Due back {dateLabel(r.endsAt)} at {timeLabel(r.endsAt)}. Return the equipment, or edit the reservation to extend it.</p>}
    <dl className="rsv-sheet">
      <div><dt>When</dt><dd>{rangeLabel(r.startsAt,r.endsAt)}</dd></div>
      <div><dt>Equipment</dt><dd><ul>{r.equipmentIds.map(id=>{const item=inventory.find(i=>i.id===id);return <li key={id}>{item?.name??'Equipment item'}{item&&<span>{item.equipmentCode}</span>}</li>})}</ul></dd></div>
      <div><dt>Client account</dt><dd>{client}</dd></div>
    </dl>
    {active&&r.fulfillmentStatus==='reserved'&&<p className="rsv-detail-foot"><button type="button" className="rsv-link rsv-danger" disabled={busy} onClick={onCancel}>Cancel reservation</button></p>}
  </>
}

const STEPS=['When','Equipment','Details'] as const
function BookingFlow({api,organizationId,inventory,clients,canAddClients,onClientAdded,maxDays,reservation,onClose,onSaved,onEquipmentAdded}:{api:DatabaseApi;organizationId:string;inventory:EquipmentRecord[];clients:ClientAccount[];canAddClients:boolean;onClientAdded:(client:ClientAccount)=>void;maxDays:number;reservation?:EquipmentReservation;onClose:()=>void;onSaved:(r:EquipmentReservation)=>Promise<void>;onEquipmentAdded:(item:EquipmentRecord)=>void}) {
  const [step,setStep]=useState(0)
  const [clientId,setClientId]=useState(reservation?.clientAccountId??''),[addingClient,setAddingClient]=useState(false)
  const start=useMemo(()=>new Date(Math.ceil((Date.now()+15*60000)/1800000)*1800000).toISOString(),[])
  const [name,setName]=useState(reservation?.name??''),[startsAt,setStartsAt]=useState(localTime(reservation?.startsAt??start)),[endsAt,setEndsAt]=useState(localTime(reservation?.endsAt??new Date(Date.parse(start)+HOUR).toISOString())),[ids,setIds]=useState(reservation?.equipmentIds??[]),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[availabilityError,setAvailabilityError]=useState(''),[showUnavailable,setShowUnavailable]=useState(false),[search,setSearch]=useState('')
  const mutation=useRef<{key:string;id:string}|null>(null),lifecycle=useMemo(()=>api.equipment(organizationId),[api,organizationId])
  const length=Date.parse(endsAt)-Date.parse(startsAt),valid=Number.isFinite(length)&&length>0&&length<=maxDays*DAY
  useEffect(()=>{let active=true;setChecking(true);setAvailabilityError('');if(!valid){setChecking(false);return}const timer=setTimeout(()=>{allPages(after=>lifecycle.availability(new Date(startsAt).toISOString(),new Date(endsAt).toISOString(),after)).then(rows=>{if(active)setAvailability(rows)}).catch(e=>{if(active)setAvailabilityError(equipmentError(e))}).finally(()=>{if(active)setChecking(false)})},300);return()=>{active=false;clearTimeout(timer)}},[lifecycle,startsAt,endsAt,valid])
  const blocked=new Set(availability.filter(r=>r.id!==reservation?.id).flatMap(r=>r.equipmentIds))
  const why=(i:EquipmentRecord)=>blocked.has(i.id)?'Reserved during these dates':i.status!=='available'?`Not available · ${i.status.replace(/_/g,' ')}`:''
  const unavailable=ids.some(id=>{const i=inventory.find(x=>x.id===id);return !i||Boolean(why(i))}),out=reservation?.fulfillmentStatus==='checked_out'
  function changeStart(value:string){const previous=Date.parse(startsAt),next=Date.parse(value),span=Date.parse(endsAt)-previous;setStartsAt(value);if(!Number.isFinite(next))return;const keep=Number.isFinite(span)&&span>0&&span<=maxDays*DAY?span:HOUR;setEndsAt(localTime(new Date(next+keep).toISOString()))}
  const presets=([['2 hours',2*HOUR],['Half day',4*HOUR],['Full day',DAY],['3 days',3*DAY],[`${maxDays} days`,maxDays*DAY]] as const).filter(([,ms],i,all)=>ms<=maxDays*DAY&&all.findIndex(p=>p[1]===ms)===i)
  const canContinue=[valid,valid&&ids.length>0&&!unavailable&&!checking&&!availabilityError,name.trim().length>0][step]
  async function submit(e:FormEvent){e.preventDefault();if(step<2){if(canContinue)setStep(step+1);return}if(busy||checking||!valid||unavailable||!ids.length||!name.trim())return;setBusy(true);setError('');try{const value={clientAccountId:clientId||null,name:name.trim(),startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString(),equipmentIds:[...ids].sort()},key=JSON.stringify({...value,version:reservation?.version});if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};const input={...value,requestId:mutation.current.id},row=reservation?await lifecycle.edit(reservation.id,{...input,version:reservation.version}):await api.createReservation(organizationId,input);mutation.current=null;await onSaved(row)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  const needle=search.trim().toLowerCase()
  const listed=inventory.filter(i=>!needle||i.name.toLowerCase().includes(needle)||i.equipmentCode.toLowerCase().includes(needle))
  const free=listed.filter(i=>!why(i)||ids.includes(i.id)),taken=listed.filter(i=>why(i)&&!ids.includes(i.id))
  const item=(i:EquipmentRecord)=>{const reason=why(i);return <label className={`rsv-item${reason&&!ids.includes(i.id)?' is-off':''}`} key={i.id}><input type="checkbox" className="rsv-check" checked={ids.includes(i.id)} disabled={Boolean(reason)&&!ids.includes(i.id)} onChange={e=>setIds(current=>e.target.checked?[...current,i.id]:current.filter(id=>id!==i.id))}/><span className="rsv-item-main"><b>{i.name}</b><small>{i.equipmentCode} · {i.category}{i.checkedOut?' · Currently checked out':''}</small></span>{reason&&<span className="rsv-item-why">{reason}</span>}</label>}
  const summary=step===0?(valid?`${dateLabel(new Date(startsAt).toISOString())} · ${lengthLabel(length)}`:''):step===1?(ids.length?`${plural(ids.length,'item')} selected`:'Pick at least one item'):''
  return <form className="rsv-flow" onSubmit={submit} aria-label={reservation?'Edit reservation':'New reservation'}>
    <div className="rsv-flow-bar"><button type="button" className="rsv-button rsv-quiet" onClick={onClose}><CloseIcon/>{reservation?'Discard changes':'Cancel'}</button><h1>{reservation?'Edit reservation':'New reservation'}</h1><span className="rsv-flow-step">Step {step+1} of {STEPS.length}</span></div>
    <div className="rsv-progress" aria-hidden="true"><i style={{width:`${(step+1)/STEPS.length*100}%`}}/></div>
    <fieldset className="rsv-flow-body" disabled={busy}>
      {step===0&&<div className="rsv-question"><h2>When do you need it?</h2><p>Up to {plural(maxDays,'day')}. Times use your device’s local timezone.{out?' Checked-out bookings keep their pickup time and equipment.':''}</p>
        <div className="rsv-pair"><label className="rsv-field">Pick up<input className="rsv-input" type="datetime-local" value={startsAt} disabled={out} onChange={e=>changeStart(e.target.value)} required/></label><label className="rsv-field">Return<input className="rsv-input" type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} required/></label></div>
        <div className="rsv-chips" role="group" aria-label="Quick lengths">{presets.map(([label,ms])=><button type="button" key={label} aria-pressed={length===ms} onClick={()=>setEndsAt(localTime(new Date(Date.parse(startsAt)+ms).toISOString()))} disabled={!Number.isFinite(Date.parse(startsAt))}>{label}</button>)}</div>
        <p className="rsv-length"><span>Length</span><b>{lengthLabel(length)}</b></p>
        {!valid&&<p className="rsv-inline-error" role="alert">Choose a return time after pickup, within {plural(maxDays,'day')}.</p>}
      </div>}
      {step===1&&<div className="rsv-question"><h2>What are you taking?</h2><p>{valid?`Showing what’s free ${rangeLabel(new Date(startsAt).toISOString(),new Date(endsAt).toISOString())}.`:''}</p>
        {checking&&<p className="rsv-hint" role="status">Checking availability…</p>}{availabilityError&&<p className="rsv-inline-error" role="alert">{availabilityError}</p>}
        {out?<><p className="rsv-hint">This booking is checked out, so its equipment can’t change.</p><ul className="rsv-items">{ids.map(id=><li className="rsv-item" key={id}><span className="rsv-item-main"><b>{inventory.find(i=>i.id===id)?.name??'Equipment item'}</b></span></li>)}</ul></>:<>
          {inventory.length>0&&<label className="rsv-field rsv-search"><span className="ws-sr-only">Search equipment</span><input className="rsv-input" value={search} placeholder="Search by name or code" onChange={e=>setSearch(e.target.value)}/></label>}
          {inventory.length>0&&<div className="rsv-items">{free.map(item)}{!free.length&&<p className="rsv-hint">{needle?'Nothing free matches that search.':'Nothing is free for these dates. Try different dates.'}</p>}</div>}
          {taken.length>0&&<div className="rsv-taken"><button type="button" className="rsv-disclosure" aria-expanded={showUnavailable} onClick={()=>setShowUnavailable(v=>!v)}><Chevron dir={showUnavailable?'down':'right'}/>Not available for these dates ({taken.length})</button>{showUnavailable&&<div className="rsv-items">{taken.map(item)}</div>}</div>}
          <QuickAddEquipment api={api} organizationId={organizationId} startOpen={!inventory.length} onAdded={added=>{onEquipmentAdded(added);setIds(current=>[...current,added.id])}}/>
          {unavailable&&<p className="rsv-inline-error" role="alert">Selected equipment is unavailable. Choose another item or go back and change the dates.</p>}
        </>}
      </div>}
      {step===2&&<div className="rsv-question"><h2>Name this booking</h2><p>Something your team will recognize on the list.</p>
        <div className="rsv-stack"><label className="rsv-field">Reservation name<input className="rsv-input" value={name} maxLength={120} placeholder="e.g. Spring reel b-roll" onChange={e=>setName(e.target.value)} required autoFocus/></label>
        <div className="rsv-client"><label className="rsv-field">Client account<Select value={addingClient?NEW_CLIENT:clientId} onChange={e=>{if(e.target.value===NEW_CLIENT)setAddingClient(true);else{setAddingClient(false);setClientId(e.target.value)}}}><option value="">No client · internal use</option>{clients.filter(c=>!c.deletedAt||c.id===clientId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}{canAddClients&&<option value={NEW_CLIENT}>+ Add a new client account…</option>}</Select></label>
        {addingClient&&<NewClientAccount api={api} organizationId={organizationId} onCancel={()=>setAddingClient(false)} onAdded={client=>{onClientAdded(client);setClientId(client.id);setAddingClient(false)}}/>}</div></div>
        <dl className="rsv-review"><div><dt>When</dt><dd>{valid?rangeLabel(new Date(startsAt).toISOString(),new Date(endsAt).toISOString()):'—'}</dd><button type="button" className="rsv-link" onClick={()=>setStep(0)}>Change<span className="ws-sr-only"> dates</span></button></div>
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
  const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function add(){if(busy)return;const value=name.trim().replace(/\s+/g,' ');if(!value){setError('Enter a name for the client account.');return}setBusy(true);setError('');try{onAdded(await api.production(organizationId).createClient(value))}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <div className="rsv-add rsv-add-client" role="group" aria-label="Add a client account"><label className="rsv-field">New client account<input className="rsv-input" value={name} maxLength={160} disabled={busy} placeholder="e.g. Southside Coffee Co." autoFocus onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void add()}}}/></label>
    <p className="rsv-hint">It’s added for your whole organization and selected for this booking.</p>
    {error&&<p className="rsv-inline-error" role="alert">{error}</p>}
    <div className="rsv-add-actions"><button type="button" className="rsv-button" disabled={busy} onClick={()=>void add()}><Plus/>{busy?'Adding client account…':'Add client account'}</button><button type="button" className="rsv-button rsv-quiet" disabled={busy} onClick={onCancel}>Cancel</button></div></div>
}

/** Lets any member add an item, in any category, without leaving the booking. It is not a nested <form>, so Enter is handled here instead of submitting the reservation. */
function QuickAddEquipment({api,organizationId,startOpen,onAdded}:{api:DatabaseApi;organizationId:string;startOpen:boolean;onAdded:(item:EquipmentRecord)=>void}) {
  const [open,setOpen]=useState(startOpen),[name,setName]=useState(''),[category,setCategory]=useState<EquipmentCategory>(equipmentCategories[0]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  async function add(){if(busy)return;const trimmed=name.trim();if(!trimmed){setError('Enter a name for the equipment.');return}setBusy(true);setError('');setNotice('');try{const item=await api.createEquipment(organizationId,{equipmentCode:generatedEquipmentCode(category),name:trimmed,category});onAdded(item);setName('');setNotice(`${item.name} added and selected.`)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  function enter(e:KeyboardEvent){if(e.key==='Enter'){e.preventDefault();void add()}}
  if(!open)return <div className="rsv-add-closed">{notice&&<p className="rsv-hint" role="status">{notice}</p>}<button type="button" className="rsv-link" onClick={()=>{setOpen(true);setNotice('')}}>Can’t find it? Add equipment</button></div>
  return <div className="rsv-add" role="group" aria-label="Add equipment">{startOpen&&<p className="rsv-hint">Your organization has no equipment yet. Add an item and it’s selected for this booking.</p>}
    <div className="rsv-pair rsv-add-fields"><label className="rsv-field">Equipment name<input className="rsv-input" value={name} maxLength={120} disabled={busy} placeholder="e.g. Sony FX3 kit" onChange={e=>setName(e.target.value)} onKeyDown={enter}/></label><label className="rsv-field">Category<Select value={category} disabled={busy} onChange={e=>setCategory(e.target.value as EquipmentCategory)}>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</Select></label></div>
    <p className="rsv-hint">A label code is generated for you. Add a photo or print the QR label later from Equipment.</p>
    {error&&<p className="rsv-inline-error" role="alert">{error}</p>}{notice&&<p className="rsv-hint" role="status">{notice}</p>}
    <div className="rsv-add-actions"><button type="button" className="rsv-button" disabled={busy} onClick={()=>void add()}><Plus/>{busy?'Adding equipment…':'Add and select'}</button>{!startOpen&&<button type="button" className="rsv-button rsv-quiet" disabled={busy} onClick={()=>setOpen(false)}>Done</button>}</div></div>
}

function StatusDot({reservation}:{reservation:EquipmentReservation}){return <span className={`rsv-status rsv-status-${statusTone(reservation)}`}>{statusText(reservation)}</span>}
const Svg=({children}:{children:ReactNode})=><svg className="rsv-icon" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
const Plus=()=><Svg><path d="M12 5v14M5 12h14"/></Svg>
const CloseIcon=()=><Svg><path d="M18 6 6 18M6 6l12 12"/></Svg>
const FilterIcon=()=><Svg><path d="M4 6h16M7 12h10M10 18h4"/></Svg>
const Chevron=({dir}:{dir:'left'|'right'|'down'})=><Svg><path d={dir==='left'?'m15 18-6-6 6-6':dir==='down'?'m6 9 6 6 6-6':'m9 18 6-6-6-6'}/></Svg>
