'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentRecord,EquipmentReservation,EquipmentAvailability} from '../../types/equipment'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import '../Accounts/Administration.css'
import './Equipment.css'
export const localTime=(iso:string)=>{const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export const reservationLabel=(r:EquipmentReservation)=>r.status==='cancelled'?'Cancelled':r.fulfillmentStatus==='checked_out'?'Checked out':r.fulfillmentStatus==='returned'?'Returned':'Reserved'
const dateLabel=(iso:string)=>new Date(iso).toLocaleString()
type CachedReservations = { settings: { reservationDays: number }; items: EquipmentRecord[]; bookings: EquipmentReservation[] }
export default function LiveReservations({create=false}:{create?:boolean}){const context=useLiveOrganization();return context?<ReservationWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} create={create}/>:<main className="administration"><h1>Reservations</h1><p>Select an active organization in your account to reserve equipment.</p></main>}
function ReservationWorkspace({api,organizationId,create}:{api:DatabaseApi;organizationId:string;create:boolean}) {
  const cacheKey = `reservations:${organizationId}`
  const cached = getCached<CachedReservations>(cacheKey)
  const [rows,setRows]=useState<EquipmentReservation[]>(cached?.bookings ?? [])
  const [inventory,setInventory]=useState<EquipmentRecord[]>(cached?.items ?? [])
  const [maxDays,setMaxDays]=useState(cached?.settings.reservationDays ?? 7)
  const [selected,setSelected]=useState('')
  const [editing,setEditing]=useState(create)
  const [adding,setAdding]=useState(create)
  const [loading,setLoading]=useState(!cached)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [filter,setFilter]=useState('active')
  const load=useCallback(async()=>{
    const [settingsRes, itemsRes, bookingsRes] = await Promise.allSettled([
      api.accounts(organizationId).settings(),
      allPages(after=>api.inventory(organizationId,{limit:100,after})),
      allPages(after=>api.reservations(organizationId,{limit:100,after}))
    ])
    if (bookingsRes.status === 'rejected') throw bookingsRes.reason
    if (itemsRes.status === 'rejected') throw itemsRes.reason
    return {
      settings: settingsRes.status === 'fulfilled' ? settingsRes.value : { reservationDays: 7 },
      items: itemsRes.status === 'fulfilled' ? itemsRes.value : [],
      bookings: bookingsRes.status === 'fulfilled' ? bookingsRes.value : []
    }
  },[api,organizationId])
  const accept=useCallback((value:Awaited<ReturnType<typeof load>>)=>{
    setRows(value.bookings)
    setInventory(value.items)
    setMaxDays(value.settings.reservationDays)
    setCached(cacheKey, value)
  },[cacheKey])
  useEffect(()=>{let active=true;load().then(value=>{if(active){accept(value);const id=new URLSearchParams(window.location.search).get('reservation');if(id&&value.bookings.some(r=>r.id===id))setSelected(id)}}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,accept])
  const current=rows.find(r=>r.id===selected),visible=rows.filter(r=>filter==='all'||r.status==='confirmed'&&r.fulfillmentStatus!=='returned'&&(filter!=='overdue'||r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now())).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))
  async function refresh(){setError('');setLoading(true);try{accept(await load())}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
  async function saved(row:EquipmentReservation){setRows(list=>[row,...list.filter(r=>r.id!==row.id)]);setSelected(row.id);setEditing(false);setAdding(false);setNotice('Reservation saved.');invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');try{accept(await load())}catch(e){setError(equipmentError(e))}}
  async function cancel(){if(!current||busy)return;setBusy(true);setError('');invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');try{await saved(await api.cancelReservation(organizationId,current.id));setNotice('Reservation cancelled.')}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <main className="administration"><header><div><p className="administration-eyebrow">Equipment bookings</p><h1>Reservations</h1><p>Book equipment, adjust dates and follow pickup and return.</p></div><div className="administration-actions"><button disabled={loading||busy} onClick={()=>void refresh()}>Refresh</button><button onClick={()=>{setAdding(true);setEditing(true);setSelected('');setNotice('')}}>New reservation</button></div></header>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading reservations…</p>}
    <label className="equipment-filter">Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Active bookings</option><option value="overdue">Overdue checkouts</option><option value="all">All history</option></select></label>
    <div className="equipment-layout"><section className="administration-table"><table><thead><tr><th>Reservation</th><th>When</th><th>Status</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><button className="equipment-item-link" onClick={()=>{setSelected(r.id);setAdding(false);setEditing(false)}}>{r.name}</button><small>{r.equipmentIds.length} items</small></td><td>{dateLabel(r.startsAt)}<small>to {dateLabel(r.endsAt)}</small></td><td>{reservationLabel(r)}{r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now()&&<small className="equipment-overdue">Overdue</small>}</td></tr>)}</tbody></table>{!loading&&!visible.length&&<p className="equipment-empty">No matching reservations.</p>}</section>
      {(current||adding)&&!loading&&<aside className="equipment-inspector" aria-label="Reservation details"><button className="equipment-item-link" onClick={()=>{setAdding(false);setSelected('');setEditing(false)}}>Close details</button><h2>{adding?'New reservation':current?.name}</h2>
        {editing?<BookingForm key={adding?'new':`${current!.id}:${current!.version}`} api={api} organizationId={organizationId} inventory={inventory} maxDays={maxDays} reservation={adding?undefined:current} onSaved={saved}/>:current&&<><p>{reservationLabel(current)}</p><p>{dateLabel(current.startsAt)} to {dateLabel(current.endsAt)}</p><ul className="equipment-detail-list">{current.equipmentIds.map(id=><li key={id}>{inventory.find(i=>i.id===id)?.name??'Equipment item'}</li>)}</ul><div className="equipment-detail-actions">{!current.readOnly&&current.status==='confirmed'&&current.fulfillmentStatus!=='returned'&&<><button onClick={()=>setEditing(true)}>Edit / extend reservation</button><Link href={`/check-in-out/?reservation=${current.id}`}>Checkout / return</Link>{current.fulfillmentStatus==='reserved'&&<button disabled={busy} onClick={()=>void cancel()}>Cancel reservation</button>}</>}</div></>}
      </aside>}
    </div>
  </main>
}
function BookingForm({api,organizationId,inventory,maxDays,reservation,onSaved}:{api:DatabaseApi;organizationId:string;inventory:EquipmentRecord[];maxDays:number;reservation?:EquipmentReservation;onSaved:(r:EquipmentReservation)=>Promise<void>}) {
  const start=useMemo(()=>new Date(Math.ceil((Date.now()+15*60000)/1800000)*1800000).toISOString(),[])
  const [name,setName]=useState(reservation?.name??''),[startsAt,setStartsAt]=useState(localTime(reservation?.startsAt??start)),[endsAt,setEndsAt]=useState(localTime(reservation?.endsAt??new Date(Date.parse(start)+3600000).toISOString())),[ids,setIds]=useState(reservation?.equipmentIds??[]),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[availabilityError,setAvailabilityError]=useState('')
  const mutation=useRef<{key:string;id:string}|null>(null),lifecycle=useMemo(()=>api.equipment(organizationId),[api,organizationId]),valid=Number.isFinite(Date.parse(startsAt))&&Number.isFinite(Date.parse(endsAt))&&Date.parse(endsAt)>Date.parse(startsAt)&&Date.parse(endsAt)-Date.parse(startsAt)<=maxDays*86400000
  useEffect(()=>{let active=true;setChecking(true);setAvailabilityError('');if(!valid){setChecking(false);return}const timer=setTimeout(()=>{allPages(after=>lifecycle.availability(new Date(startsAt).toISOString(),new Date(endsAt).toISOString(),after)).then(rows=>{if(active)setAvailability(rows)}).catch(e=>{if(active)setAvailabilityError(equipmentError(e))}).finally(()=>{if(active)setChecking(false)})},300);return()=>{active=false;clearTimeout(timer)}},[lifecycle,startsAt,endsAt,valid])
  const blocked=new Set(availability.filter(r=>r.id!==reservation?.id).flatMap(r=>r.equipmentIds)),unavailable=ids.some(id=>blocked.has(id)||!inventory.some(i=>i.id===id&&i.status==='available')),out=reservation?.fulfillmentStatus==='checked_out'
  async function submit(e:FormEvent){e.preventDefault();if(busy||checking||!valid||unavailable)return;setBusy(true);setError('');try{const value={name,startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString(),equipmentIds:[...ids].sort()},key=JSON.stringify({...value,version:reservation?.version});if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};const input={...value,requestId:mutation.current.id},row=reservation?await lifecycle.edit(reservation.id,{...input,version:reservation.version}):await api.createReservation(organizationId,input);mutation.current=null;await onSaved(row)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <form className="equipment-editor" onSubmit={submit}><fieldset disabled={busy}><label>Reservation name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} required/></label><label>Starts<input type="datetime-local" value={startsAt} disabled={out} onChange={e=>setStartsAt(e.target.value)} required/></label><label>Ends<input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} required/></label><p className="administration-hint">Times use your device’s local timezone. Maximum {maxDays} days.{out?' Checked-out bookings keep their start and equipment.':''}</p>
    {!valid&&<p role="alert">Choose an end after the start, within {maxDays} days.</p>}{availabilityError&&<p role="alert">{availabilityError}</p>}{checking&&<p role="status">Checking availability…</p>}
    <fieldset disabled={out}><legend>Equipment</legend><div className="equipment-pick-list">{inventory.map(i=><label className="administration-checkbox" key={i.id}><input type="checkbox" checked={ids.includes(i.id)} disabled={(blocked.has(i.id)||i.status!=='available')&&!ids.includes(i.id)} onChange={e=>setIds(current=>e.target.checked?[...current,i.id]:current.filter(id=>id!==i.id))}/><span>{i.name}<small>{i.equipmentCode} · {blocked.has(i.id)?'Reserved during these dates':i.status}{i.checkedOut?' · Currently checked out':''}</small></span></label>)}</div></fieldset>
    {unavailable&&<p role="alert">Selected equipment is unavailable. Choose another item or different dates.</p>}{error&&<p role="alert">{error}</p>}<button disabled={busy||checking||!valid||!ids.length||unavailable||Boolean(availabilityError)}>{busy?'Saving reservation…':reservation?'Save reservation':'Create reservation'}</button>
  </fieldset></form>
}
