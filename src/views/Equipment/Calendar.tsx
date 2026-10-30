'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type {DatesSetArg} from '@fullcalendar/core'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentAvailability,EquipmentRecord,EquipmentReservation} from '../../types/equipment'
import {getCached,setCached} from '../../api/cache'
import '../Accounts/Administration.css'
import './Equipment.css'
export default function LiveEquipmentCalendar(){const c=useLiveOrganization();return c?<CalendarWorkspace key={c.organization.id} api={c.api} org={c.organization.id}/>:<main className="administration"><h1>Equipment calendar</h1><p>Select an active organization in your account to view equipment bookings.</p></main>}
function CalendarWorkspace({api,org}:{api:DatabaseApi;org:string}){
 const cachedInventory = getCached<EquipmentRecord[]>(`inventory:${org}`)
 const cachedReservations = getCached<{ bookings: EquipmentReservation[] }>(`reservations:${org}`)
 const cachedDashboard = getCached<{ items: EquipmentRecord[]; bookings: EquipmentReservation[] }>(`dashboard:${org}`)

 const initialItems = cachedInventory ?? cachedDashboard?.items ?? []
 const initialBookings = cachedReservations?.bookings ?? cachedDashboard?.bookings ?? []

 const [window,setWindow]=useState<{start:string;end:string}|null>(null),[items,setItems]=useState<EquipmentRecord[]>(initialItems),[bookings,setBookings]=useState<EquipmentReservation[]>(initialBookings),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState(''),[equipment,setEquipment]=useState(''),[reload,setReload]=useState(0)
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
 const visible=availability.filter(r=>!equipment||r.equipmentIds.includes(equipment)),events=visible.map(r=>({id:r.id,title:bookings.find(b=>b.id===r.id)?.name??'Reserved equipment',start:r.startsAt,end:r.endsAt,backgroundColor:r.fulfillmentStatus==='checked_out'?'#675078':'#7138b8',borderColor:'transparent'})),current=visible.find(r=>r.id===selected),owned=bookings.find(r=>r.id===selected),item=items.find(i=>i.id===equipment)
 const dates=useCallback((arg:DatesSetArg)=>{const start=arg.start.toISOString(),end=arg.end.toISOString();setWindow(current=>current?.start===start&&current.end===end?current:{start,end})},[])
 return <main className="administration"><header><div><p className="administration-eyebrow">Gear schedule</p><h1>Equipment calendar</h1><p>View reserved equipment and pickup dates in your local timezone.</p></div><div className="administration-actions"><button disabled={loading} onClick={()=>setReload(v=>v+1)}>Refresh</button><Link href="/create-reservation/">Reserve equipment</Link></div></header>
  <label className="equipment-filter">Filter equipment<select value={equipment} onChange={e=>{setEquipment(e.target.value);setSelected('')}}><option value="">All equipment</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} · {i.equipmentCode}</option>)}</select></label>{item&&<p className="administration-hint">Current condition: {item.condition} · {item.status}{item.checkedOut?' · Currently checked out':''}</p>}
  {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading equipment calendar…</p>}
  <div className="equipment-calendar"><FullCalendar plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialView="dayGridMonth" headerToolbar={{left:'prev,next today',center:'title',right:'dayGridMonth,timeGridWeek,timeGridDay'}} datesSet={dates} events={events} height="auto" dayMaxEvents eventClick={arg=>setSelected(arg.event.id)} editable={false}/></div>
  {current&&<section aria-label="Selected equipment booking"><h2>{owned?.name??'Reserved equipment'}</h2><p>{new Date(current.startsAt).toLocaleString()} to {new Date(current.endsAt).toLocaleString()} · {current.fulfillmentStatus==='checked_out'?'Checked out':'Reserved'}</p><ul className="equipment-detail-list">{current.equipmentIds.map(id=><li key={id}>{items.find(i=>i.id===id)?.name??'Equipment item'}</li>)}</ul>{owned&&<Link href={`/reservations/?reservation=${owned.id}`}>{owned.readOnly?'View reservation':'View reservation / change dates'}</Link>}</section>}
  {!loading&&!error&&!visible.length&&<p className="equipment-empty">No equipment bookings in this period.</p>}
  <p className="administration-hint">Production Leads can view organization booking names and equipment. Other members see their own booking details and shared occupied slots. Overdue checkouts keep equipment unavailable for pickup until returned.</p>
 </main>
}
