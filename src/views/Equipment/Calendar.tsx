'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {DatesSetArg} from '@fullcalendar/core'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentAvailability,EquipmentRecord,EquipmentReservation} from '../../types/equipment'
import {getCached,setCached} from '../../api/cache'
import {Button,Field,PageHeader,Select} from '../../components/workspace/WorkspaceUI'
import {WorkspaceCalendar} from '../../components/workspace/WorkspaceCalendar'
import {usePickedDay} from '../../components/workspace/usePickedDay'
import './Equipment.css'

type Status='reserved'|'checked-out'|'overdue'
const statusLabel:Record<Status,string>={reserved:'Reserved','checked-out':'Checked out',overdue:'Overdue'}
const when=(value:string)=>new Date(value).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
const time=(value:string)=>new Date(value).toLocaleString(undefined,{weekday:'short',hour:'numeric',minute:'2-digit'})
const views=[{value:'dayGridMonth',label:'Month'},{value:'timeGridWeek',label:'Week'},{value:'timeGridDay',label:'Day'}]
/** Checked-out bookings past their return time are overdue; the rest keep their fulfillment state. */
function statusOf(booking:{fulfillmentStatus:string;endsAt:string},now:number):Status{return booking.fulfillmentStatus==='checked_out'?(Date.parse(booking.endsAt)<now?'overdue':'checked-out'):'reserved'}

export default function LiveEquipmentCalendar(){const c=useLiveOrganization();return c?<CalendarWorkspace key={c.organization.id} api={c.api} org={c.organization.id}/>:<main className="ws-calendar-page"><PageHeader context="Equipment schedule" title="Equipment calendar" description="Select an active organization in your account to view equipment bookings."/></main>}
function CalendarWorkspace({api,org}:{api:DatabaseApi;org:string}){
 const [initialView] = useState(() => getCached<{date:string;view:string}>(`calendar-view:${org}`,86_400_000))
 const day=usePickedDay()
 const cachedInventory = getCached<EquipmentRecord[]>(`inventory:${org}`)
 const cachedReservations = getCached<{ bookings: EquipmentReservation[] }>(`reservations:${org}`)
 const cachedDashboard = getCached<{ items: EquipmentRecord[]; bookings: EquipmentReservation[] }>(`dashboard:${org}`)

 const initialItems = cachedInventory ?? cachedDashboard?.items ?? []
 const initialBookings = cachedReservations?.bookings ?? cachedDashboard?.bookings ?? []

 const [window,setWindow]=useState<{start:string;end:string}|null>(null),[items,setItems]=useState<EquipmentRecord[]>(initialItems),[bookings,setBookings]=useState<EquipmentReservation[]>(initialBookings),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState(''),[equipment,setEquipment]=useState(''),[reload,setReload]=useState(0),[now,setNow]=useState(()=>Date.now())
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
    allPages(after=>api.reservations(org,{limit:100,after}))
  ]).then(([availableRes,inventoryRes,reservationsRes])=>{
    if(!active)return
    if(availableRes.status==='fulfilled'){
      setAvailability(availableRes.value)
      setCached(rangeKey, availableRes.value)
    }
    if(inventoryRes.status==='fulfilled'){
      setItems(inventoryRes.value)
      setCached(`inventory:${org}`, inventoryRes.value)
    }
    if(reservationsRes.status==='fulfilled')setBookings(reservationsRes.value)
    if(availableRes.status==='rejected'&&inventoryRes.status==='rejected'&&reservationsRes.status==='rejected'){
      setError(equipmentError(availableRes.reason))
    } else if(availableRes.status==='rejected'){
      setError(equipmentError(availableRes.reason))
    }
  }).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)})
  return()=>{active=false}
 },[api,org,lifecycle,window,reload])
 const nameOf=(id:string)=>bookings.find(b=>b.id===id)?.name??'Reserved equipment'
 const visible=availability.filter(r=>!equipment||r.equipmentIds.includes(equipment))
 const events=visible.map(r=>{const status=statusOf(r,now);return {id:r.id,title:nameOf(r.id),start:r.startsAt,end:r.endsAt,classNames:['ws-event',`ws-event--${status}`,...(r.id===selected?['is-selected']:[])],extendedProps:{label:`${statusLabel[status]}: ${nameOf(r.id)}, pickup ${when(r.startsAt)}, return ${when(r.endsAt)}`}}})
 const current=visible.find(r=>r.id===selected),owned=bookings.find(r=>r.id===selected),item=items.find(i=>i.id===equipment)
 const dates=useCallback((arg:DatesSetArg)=>{const start=arg.start.toISOString(),end=arg.end.toISOString();setCached(`calendar-view:${org}`,{date:arg.view.currentStart.toISOString(),view:arg.view.type});setWindow(current=>current?.start===start&&current.end===end?current:{start,end})},[org])
 return <main className="ws-calendar-page">
  <PageHeader context="Equipment schedule" title="Equipment calendar" description="Gear reservations from pickup to return, in your local time zone. Pickups and returns happen on campus." actions={<><Button disabled={loading} onClick={()=>{setNow(Date.now());setReload(v=>v+1)}}>Refresh</Button><Link className="ws-button ws-button-primary" href="/create-reservation/">Reserve equipment</Link></>}/>
  <div className="ws-calendar-filters">
   <Field label="Filter equipment"><Select value={equipment} onChange={e=>{setEquipment(e.target.value);setSelected('')}}><option value="">All equipment</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} · {i.equipmentCode}</option>)}</Select></Field>
   <ul className="ws-calendar-legend" aria-label="Legend">{(['reserved','checked-out','overdue'] as Status[]).map(s=><li key={s}><span className={`ws-swatch ws-swatch--${s}`} aria-hidden="true"/>{statusLabel[s]}</li>)}</ul>
  </div>
  {item&&<p className="administration-hint">Current condition: {item.condition} · {item.status}{item.checkedOut?' · Currently checked out':''}</p>}
  {error&&<p role="alert">{error}</p>}{loading&&<p className="ws-sr-only" role="status">Loading equipment calendar…</p>}
  <div className="ws-calendar-layout">
   <WorkspaceCalendar label="Equipment bookings" viewChoices={views} dateClick={day.dateClick} dayCellClassNames={day.dayCellClassNames} plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialDate={initialView?.date} initialView={initialView?.view ?? 'dayGridMonth'} datesSet={dates} events={events} dayMaxEvents eventClick={arg=>setSelected(arg.event.id)} editable={false}/>
   <aside className="ws-calendar-aside" aria-label="Booking details">
    {current?<section className="ws-calendar-card" aria-label="Selected equipment booking">
     <header><span className={`ws-calendar-badge ws-event--${statusOf(current,now)}`}>{statusLabel[statusOf(current,now)]}</span><h2>{owned?.name??'Reserved equipment'}</h2></header>
     <dl className="ws-calendar-facts"><dt>Pickup</dt><dd className="is-strong">{when(current.startsAt)}</dd><dt>Return</dt><dd className="is-strong">{when(current.endsAt)}</dd></dl>
     <div><h3>Equipment</h3><ul className="ws-calendar-list is-items">{current.equipmentIds.map(id=>{const record=items.find(i=>i.id===id);return <li key={id}><span>{record?.name??'Equipment item'}</span><span>{record?.equipmentCode}</span></li>})}</ul></div>
     {owned&&<Link className="ws-button ws-button-primary" href={`/reservations/?reservation=${owned.id}`}>{owned.readOnly?'View reservation':'View reservation / change dates'}</Link>}
    </section>:<section className="ws-calendar-card" aria-label="Selected equipment booking"><h2 className="ws-calendar-card-title">Booking details</h2><p>Select a booking on the calendar to see its pickup, return and equipment.</p></section>}
    <Handoffs bookings={bookings} now={now}/>
   </aside>
  </div>
  {!loading&&!error&&!visible.length&&<p className="equipment-empty">No equipment bookings in this period.</p>}
  <p className="ws-calendar-hint">Production Leads see every booking name and item. Other members see their own booking details and shared occupied slots. Overdue checkouts keep equipment unavailable until it’s returned.</p>
 </main>
}

/** Overdue returns first, then pickups and returns due before the end of tomorrow. */
function Handoffs({bookings,now}:{bookings:EquipmentReservation[];now:number}){
 const today=new Date(now),endOfTomorrow=new Date(today.getFullYear(),today.getMonth(),today.getDate()+2).getTime(),startOfToday=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()
 const active=bookings.filter(b=>b.status==='confirmed')
 const rows=[
  ...active.filter(b=>b.fulfillmentStatus==='checked_out'&&Date.parse(b.endsAt)<now).map(b=>({id:b.id+':overdue',at:Date.parse(b.endsAt),overdue:true,title:'Overdue return',name:b.name,detail:`Was due ${when(b.endsAt)}`})),
  ...active.filter(b=>b.fulfillmentStatus==='checked_out'&&Date.parse(b.endsAt)>=now&&Date.parse(b.endsAt)<endOfTomorrow).map(b=>({id:b.id+':return',at:Date.parse(b.endsAt),overdue:false,title:`Return · ${time(b.endsAt)}`,name:b.name,detail:''})),
  ...active.filter(b=>b.fulfillmentStatus==='reserved'&&Date.parse(b.startsAt)>=startOfToday&&Date.parse(b.startsAt)<endOfTomorrow).map(b=>({id:b.id+':pickup',at:Date.parse(b.startsAt),overdue:false,title:`Pickup · ${time(b.startsAt)}`,name:b.name,detail:''})),
 ].sort((a,b)=>Number(b.overdue)-Number(a.overdue)||a.at-b.at)
 return <section className="ws-calendar-card" aria-label="Handoffs">
  <div><h2 className="ws-calendar-card-title">Handoffs</h2><p>Today, {today.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}, and tomorrow.</p></div>
  {rows.length?<ul className="ws-calendar-rows">{rows.map(r=><li key={r.id} className={`ws-handoff${r.overdue?' is-overdue':''}`}><strong>{r.title}</strong><span>{r.name}</span>{r.detail&&<small>{r.detail}</small>}</li>)}</ul>:<p>No pickups or returns due today or tomorrow.</p>}
  <Link className="ws-button" href="/check-in-out/">Scan to hand off</Link>
 </section>
}
