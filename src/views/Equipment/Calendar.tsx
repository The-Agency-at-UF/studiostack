'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {sentenceCase} from '../../utils/sentenceCase'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import {softHoldsFor} from '../../production/readiness'
import type {ProductionBrief} from '../../types/production'
import type {DatesSetArg} from '@fullcalendar/core'
import {HiOutlinePlus} from 'react-icons/hi2'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentAvailability,EquipmentRecord,EquipmentReservation} from '../../types/equipment'
import {getCached,setCached} from '../../api/cache'
import { Button, Field, PageHeader, Select, Notice, Skeleton, ButtonLink } from '../../components/workspace/WorkspaceUI'
import {WorkspaceCalendar} from '../../components/workspace/WorkspaceCalendar'
import {usePickedDay} from '../../components/workspace/usePickedDay'
import {revealPanel} from '../../components/workspace/revealPanel'

type Status='reserved'|'checked-out'|'overdue'
const statusLabel:Record<Status,string>={reserved:'Reserved','checked-out':'Checked out',overdue:'Overdue'}
const when=(value:string)=>new Date(value).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
const time=(value:string)=>new Date(value).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})
const views=[{value:'dayGridMonth',label:'Month'},{value:'timeGridWeek',label:'Week'},{value:'timeGridDay',label:'Day'}]
/** Checked-out bookings past their return time are overdue; the rest keep their fulfillment state. */
function statusOf(booking:{fulfillmentStatus:string;endsAt:string},now:number):Status{return booking.fulfillmentStatus==='checked_out'?(Date.parse(booking.endsAt)<now?'overdue':'checked-out'):'reserved'}

export default function LiveEquipmentCalendar(){const c=useLiveOrganization();return c?<CalendarWorkspace key={c.organization.id} api={c.api} org={c.organization.id} admin={c.admin}/>:<main className="ws-calendar-page"><PageHeader title="Equipment calendar"/><p>Select an active organization in your account to view equipment bookings.</p></main>}
function CalendarWorkspace({api,org,admin}:{api:DatabaseApi;org:string;admin:boolean}){
 const [initialView] = useState(() => getCached<{date:string;view:string}>(`calendar-view:${org}`,86_400_000))
 const day=usePickedDay()
 const cachedInventory = getCached<EquipmentRecord[]>(`inventory:${org}`)
 const cachedReservations = getCached<{ bookings: EquipmentReservation[] }>(`reservations:${org}`)
 const cachedDashboard = getCached<{ items: EquipmentRecord[]; bookings: EquipmentReservation[] }>(`dashboard:${org}`)

 const initialItems = cachedInventory ?? cachedDashboard?.items ?? []
 const initialBookings = cachedReservations?.bookings ?? cachedDashboard?.bookings ?? []

 const [window,setWindow]=useState<{start:string;end:string}|null>(null),[items,setItems]=useState<EquipmentRecord[]>(initialItems),[bookings,setBookings]=useState<EquipmentReservation[]>(initialBookings),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState(''),[equipment,setEquipment]=useState(''),[reload,setReload]=useState(0),[now,setNow]=useState(()=>Date.now()),[reservationsFailed,setReservationsFailed]=useState(false)
 const [briefs,setBriefs]=useState<ProductionBrief[]>([]),[confirmed,setConfirmed]=useState(true),[holds,setHolds]=useState(admin)
 const lifecycle=useMemo(()=>api.equipment(org),[api,org])
 useEffect(()=>{
  let active=true
  if(!window)return
  const rangeKey = `calendar:${org}:${window.start}:${window.end}`
  const cachedRange = getCached<EquipmentAvailability[]>(rangeKey)
  if (cachedRange) {
    setAvailability(cachedRange)
    setLoading(false)
  } else {
    setLoading(true)
  }
  setError('');setSelected('')
  Promise.allSettled([
    allPages(after=>lifecycle.availability(window.start,window.end,after)),
    allPages(after=>api.inventory(org,{limit:100,after})),
    allPages(after=>api.reservations(org,{limit:100,after})),
    typeof api.production==='function'?allPages(after=>api.production(org).list(after)):Promise.resolve([] as ProductionBrief[])
  ]).then(([availableRes,inventoryRes,reservationsRes,briefsRes])=>{
    if(!active)return
    if(availableRes.status==='fulfilled'){
      setAvailability(availableRes.value)
      setCached(rangeKey, availableRes.value)
    }
    if(inventoryRes.status==='fulfilled'){
      setItems(inventoryRes.value)
      setCached(`inventory:${org}`, inventoryRes.value)
    }
    if(briefsRes.status==='fulfilled')setBriefs(briefsRes.value)
    if(reservationsRes.status==='fulfilled')setBookings(reservationsRes.value)
    // Without the reservation list, booking names and handoffs are unknown: say so instead of showing "none".
    setReservationsFailed(reservationsRes.status==='rejected')
    if(availableRes.status==='rejected')setError(equipmentError(availableRes.reason,'load'))
  }).catch(e=>{if(active)setError(equipmentError(e,'load'))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[api,org,lifecycle,window,reload])
 const retry=()=>{setNow(Date.now());setReload(v=>v+1)}
 const nameOf=(id:string)=>bookings.find(b=>b.id===id)?.name??'Reserved equipment'
 const visible=availability.filter(r=>confirmed&&(!equipment||r.equipmentIds.includes(equipment)))
 const softEvents=holds&&!equipment?briefs.filter(b=>!['draft','denied','withdrawn'].includes(b.status)&&!b.shootStartsAt).flatMap(b=>softHoldsFor(b).map(h=>({id:`soft:${b.id}:${h.id}`,title:`${b.data.projectName} (unconfirmed)`,start:h.startsAt,end:h.endsAt,classNames:['ws-event','ws-event--tentative'],extendedProps:{label:`Unconfirmed soft hold: ${b.data.projectName}`}}))):[]
 const events=visible.map(r=>{const status=statusOf(r,now);return {id:r.id,title:nameOf(r.id),start:r.startsAt,end:r.endsAt,classNames:['ws-event',`ws-event--${status}`,...(r.id===selected?['is-selected']:[])],extendedProps:{label:`${statusLabel[status]}: ${nameOf(r.id)}, pickup ${when(r.startsAt)}, return ${when(r.endsAt)}`}}})
 const current=visible.find(r=>r.id===selected),owned=bookings.find(r=>r.id===selected),item=items.find(i=>i.id===equipment)
 const dates=useCallback((arg:DatesSetArg)=>{const start=arg.start.toISOString(),end=arg.end.toISOString();setCached(`calendar-view:${org}`,{date:arg.view.currentStart.toISOString(),view:arg.view.type});setWindow(current=>current?.start===start&&current.end===end?current:{start,end})},[org])
 return <main className="ws-calendar-page">
  <PageHeader title="Equipment calendar" actions={<><Button disabled={loading} onClick={retry}>{loading?'Refreshing…':'Refresh'}</Button><ButtonLink variant="primary" href="/create-reservation/"><HiOutlinePlus aria-hidden="true"/>Book gear</ButtonLink></>}/>
  <div className="ws-calendar-filters">
   <Field label="Filter equipment"><Select value={equipment} onChange={e=>{setEquipment(e.target.value);setSelected('')}}><option value="">All equipment</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.equipmentCode})</option>)}</Select></Field>
   {equipment&&<p className="inventory-result-count" aria-live="polite">{visible.length} {visible.length===1?'booking':'bookings'} in view. <Button variant="link" onClick={()=>{setEquipment('');setSelected('')}}>Clear filter</Button></p>}
   <div className="ws-calendar-toggles"><label className="ws-check-chip"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Equipment bookings</label><label className="ws-check-chip"><input type="checkbox" checked={holds} onChange={e=>setHolds(e.target.checked)}/>Production soft holds</label></div>
   <ul className="ws-calendar-legend" aria-label="Legend">{(['reserved','checked-out','overdue'] as Status[]).map(s=><li key={s}><span className={`ws-swatch ws-swatch--${s}`} aria-hidden="true"/>{statusLabel[s]}</li>)}{holds&&<li><span className="ws-swatch ws-swatch--tentative" aria-hidden="true"/>Production soft hold</li>}</ul>
  </div>
  {item&&<p className="administration-hint">Current condition: {sentenceCase(String(item.condition??''))}, {sentenceCase(String(item.status??'').replaceAll('_',' '))}{item.checkedOut?', currently checked out':''}</p>}
  {error&&<Notice kind="error" action={<Button disabled={loading} onClick={retry}>{loading?'Retrying…':'Retry'}</Button>}><strong>Bookings for this period couldn’t load.</strong> {error}</Notice>}
  {reservationsFailed&&!error&&<Notice kind="warning" action={<Button disabled={loading} onClick={retry}>Retry</Button>}>Booking names and today’s pickups and returns couldn’t load. The calendar still shows which times are taken.</Notice>}
  {loading&&!availability.length&&!error&&<Skeleton label="Loading equipment calendar…" variant="tile" count={6}/>}
  <div className="ws-calendar-layout">
   <WorkspaceCalendar label="Equipment bookings" viewChoices={views} dateClick={day.dateClick} dayCellClassNames={day.dayCellClassNames} plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialDate={initialView?.date} initialView={initialView?.view ?? 'dayGridMonth'} datesSet={dates} events={[...events,...softEvents]} dayMaxEvents eventClick={arg=>{setSelected(arg.event.id);revealPanel('.ws-calendar-aside .ws-calendar-card h2')}} editable={false}/>
   <aside className="ws-calendar-aside" aria-label="Booking details">
    {selected.startsWith('soft:')?<section className="ws-calendar-card"><h2>Unconfirmed soft hold</h2><p>Soft holds do not reserve equipment or crew.</p><ButtonLink href={`/production/?brief=${selected.split(':')[1]}`}>Open production brief</ButtonLink></section>:current?<section className="ws-calendar-card" aria-label="Selected equipment booking">
     <header><span className={`ws-calendar-badge ws-event--${statusOf(current,now)}`}>{statusLabel[statusOf(current,now)]}</span><h2>{owned?.name??'Reserved equipment'}</h2></header>
     <dl className="ws-calendar-facts"><dt>Pickup</dt><dd className="is-strong">{when(current.startsAt)}</dd><dt>Return</dt><dd className="is-strong">{when(current.endsAt)}</dd></dl>
     <div><h3>Equipment</h3><ul className="ws-calendar-list is-items">{current.equipmentIds.map(id=>{const record=items.find(i=>i.id===id);return <li key={id}><span>{record?.name??'Equipment item'}</span><span>{record?.equipmentCode}</span></li>})}</ul></div>
     {owned&&<ButtonLink variant="primary" href={`/reservations/?reservation=${owned.id}`}>{owned.readOnly?'View reservation':'View reservation / change dates'}</ButtonLink>}
    </section>:<section className="ws-calendar-card" aria-label="Selected equipment reservation"><h2 className="ws-calendar-card-title">Reservation details</h2><p>Select a reservation on the calendar to see its pickup, return and equipment.</p></section>}
    <Handoffs bookings={bookings} now={now} failed={reservationsFailed} onRetry={retry}/>
   </aside>
  </div>
  {!loading&&!error&&!visible.length&&<div className="equipment-empty">{equipment&&availability.length?<><p>No reservations for {item?.name??'this equipment'} in this period.</p><Button onClick={()=>setEquipment('')}>Show all equipment</Button></>:<p>No reservations in this period. Move to another month, or start a new reservation.</p>}</div>}
 </main>
}

/** Overdue returns first, then pickups and returns due before the end of tomorrow. */
function Handoffs({bookings,now,failed=false,onRetry}:{bookings:EquipmentReservation[];now:number;failed?:boolean;onRetry?:()=>void}){
 const today=new Date(now),endOfTomorrow=new Date(today.getFullYear(),today.getMonth(),today.getDate()+2).getTime(),startOfToday=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()
 const active=bookings.filter(b=>b.status==='confirmed')
 const rows=[
  ...active.filter(b=>b.fulfillmentStatus==='checked_out'&&Date.parse(b.endsAt)<now).map(b=>({id:b.id+':overdue',at:Date.parse(b.endsAt),overdue:true,title:'Overdue return',name:b.name,detail:`Was due ${when(b.endsAt)}`})),
  ...active.filter(b=>b.fulfillmentStatus==='checked_out'&&Date.parse(b.endsAt)>=now&&Date.parse(b.endsAt)<endOfTomorrow).map(b=>({id:b.id+':return',at:Date.parse(b.endsAt),overdue:false,title:`Return at ${time(b.endsAt)}`,name:b.name,detail:''})),
  ...active.filter(b=>b.fulfillmentStatus==='reserved'&&Date.parse(b.startsAt)>=startOfToday&&Date.parse(b.startsAt)<endOfTomorrow).map(b=>({id:b.id+':pickup',at:Date.parse(b.startsAt),overdue:false,title:`Pickup at ${time(b.startsAt)}`,name:b.name,detail:''})),
 ].sort((a,b)=>Number(b.overdue)-Number(a.overdue)||a.at-b.at)
 return <section className="ws-calendar-card" aria-label="Pickups and returns">
  <div><h2 className="ws-calendar-card-title">Pickups & returns</h2></div>
  {failed&&!rows.length?<div role="alert"><p>Pickups and returns couldn’t load, so today’s aren’t shown.</p>{onRetry&&<Button onClick={onRetry}>Retry</Button>}</div>:rows.length?<ul className="ws-calendar-rows">{rows.map(r=><li key={r.id} className={`ws-handoff${r.overdue?' is-overdue':''}`}><strong>{r.title}</strong><span>{r.name}</span>{r.detail&&<small>{r.detail}</small>}</li>)}</ul>:<p>No pickups or returns due today or tomorrow.</p>}
  <ButtonLink href="/check-in-out/">Scan for pickup or return</ButtonLink>
 </section>
}
