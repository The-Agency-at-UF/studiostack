'use client'
import {DetailPanel,Select,Skeleton} from '../../components/workspace/WorkspaceUI'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {ClientAccount} from '../../types/production'
import type {FormEvent,KeyboardEvent} from 'react'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {EquipmentRecord,EquipmentReservation,EquipmentAvailability} from '../../types/equipment'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {equipmentCategories,type EquipmentCategory} from '../../types/database-api'
import {generatedEquipmentCode} from './equipmentCode'
import '../Accounts/Administration.css'
import './Equipment.css'
const localTime=(iso:string)=>{const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export const reservationLabel=(r:EquipmentReservation)=>r.status==='cancelled'?'Cancelled':r.fulfillmentStatus==='checked_out'?'Checked out':r.fulfillmentStatus==='returned'?'Returned':'Reserved'
const dateLabel=(iso:string)=>new Date(iso).toLocaleString()
type CachedReservations = { settings: { reservationDays: number }; items: EquipmentRecord[]; bookings: EquipmentReservation[]; clients: ClientAccount[] }
export default function LiveReservations({create=false}:{create?:boolean}){const context=useLiveOrganization();return context?<ReservationWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} admin={context.admin} create={create}/>:<main className="administration"><h1>Reservations</h1><p>Select an active organization in your account to reserve equipment.</p></main>}
function ReservationWorkspace({api,organizationId,admin,create}:{api:DatabaseApi;organizationId:string;admin:boolean;create:boolean}) {
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
  const [clients,setClients]=useState<ClientAccount[]>(cached?.clients ?? [])
  const [clientFilter,setClientFilter]=useState('')
  const load=useCallback(async()=>{
    const [settingsRes, itemsRes, bookingsRes, clientsRes] = await Promise.allSettled([
      api.accounts(organizationId).settings(),
      allPages(after=>api.inventory(organizationId,{limit:100,after})),
      allPages(after=>api.reservations(organizationId,{limit:100,after})),
      allPages(after=>api.production(organizationId).clients(after))
    ])
    if (bookingsRes.status === 'rejected') throw bookingsRes.reason
    if (itemsRes.status === 'rejected') throw itemsRes.reason
    return {
      settings: settingsRes.status === 'fulfilled' ? settingsRes.value : { reservationDays: 7 },
      items: itemsRes.status === 'fulfilled' ? itemsRes.value : [],
      bookings: bookingsRes.status === 'fulfilled' ? bookingsRes.value : [],
      clients: clientsRes.status === 'fulfilled' ? clientsRes.value : []
    }
  },[api,organizationId])
  const accept=useCallback((value:Awaited<ReturnType<typeof load>>)=>{
    setClients(value.clients)
    setRows(value.bookings)
    setInventory(value.items)
    setMaxDays(value.settings.reservationDays)
    setCached(cacheKey, value)
  },[cacheKey])
  useEffect(()=>{let active=true;load().then(value=>{if(active){accept(value);const id=new URLSearchParams(window.location.search).get('reservation');if(id&&value.bookings.some(r=>r.id===id))setSelected(id)}}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,accept])
  const current=rows.find(r=>r.id===selected),visible=rows.filter(r=>(!clientFilter||r.clientAccountId===clientFilter)&&(filter==='all'||r.status==='confirmed'&&r.fulfillmentStatus!=='returned'&&(filter!=='overdue'||r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now()))).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt))
  async function refresh(){setError('');setLoading(true);try{accept(await load())}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
  function equipmentAdded(item:EquipmentRecord){setInventory(list=>[...list.filter(i=>i.id!==item.id),item]);for(const key of ['inventory','reservations','dashboard','reports','fulfillment','calendar'])invalidateCache(`${key}:${organizationId}`)}
  async function saved(row:EquipmentReservation){setRows(list=>[row,...list.filter(r=>r.id!==row.id)]);setSelected(row.id);setEditing(false);setAdding(false);setNotice('Reservation saved.');invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');try{accept(await load())}catch(e){setError(equipmentError(e))}}
  // Optimistic: the booking reads as cancelled at once; the previous booking returns if the server rejects the cancellation.
  async function cancel(){if(!current||busy)return;const previous=current;setBusy(true);setError('');setNotice('');invalidateCache(`reservations:${organizationId}`);invalidateCache('dashboard:');setRows(list=>list.map(r=>r.id===previous.id?{...r,status:'cancelled'}:r))
    let row:EquipmentReservation;try{row=await api.cancelReservation(organizationId,previous.id)}catch(e){setRows(list=>list.map(r=>r.id===previous.id?previous:r));setError(equipmentError(e));setBusy(false);return}
    try{await saved(row);setNotice('Reservation cancelled.')}finally{setBusy(false)}}
  return <main className="administration workspace-surface"><header><div><p className="administration-eyebrow">Equipment bookings</p><h1>Reservations</h1><p>Book equipment, adjust dates and follow pickup and return.</p></div><div className="administration-actions"><button disabled={loading||busy} onClick={()=>void refresh()}>Refresh</button><button className="ws-button-primary" onClick={()=>{setAdding(true);setEditing(true);setSelected('');setNotice('')}}>New reservation</button></div></header>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <label className="equipment-filter">Client account<Select value={clientFilter} onChange={e=>setClientFilter(e.target.value)}><option value="">All client accounts</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.deletedAt?' · Deleted':''}</option>)}</Select></label>
    <label className="equipment-filter">Show<Select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Active bookings</option><option value="overdue">Overdue checkouts</option><option value="all">All history</option></Select></label>
    <div className="equipment-layout"><section className="administration-table">{loading&&!rows.length?<Skeleton label="Loading reservations…" variant="row" count={4}/>:<table><thead><tr><th>Reservation</th><th>When</th><th>Status</th></tr></thead><tbody className="ws-stagger">{visible.map(r=><tr key={r.id}><td><button className="equipment-item-link" onClick={()=>{setSelected(r.id);setAdding(false);setEditing(false)}}>{r.name}</button><small>{r.equipmentIds.length} items</small></td><td>{dateLabel(r.startsAt)}<small>to {dateLabel(r.endsAt)}</small></td><td>{reservationLabel(r)}{r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<Date.now()&&<small className="equipment-overdue">Overdue</small>}</td></tr>)}</tbody></table>}{!loading&&!visible.length&&<p className="equipment-empty">No matching reservations.</p>}</section>
      {(current||adding)&&!(loading&&!rows.length)&&<DetailPanel className="equipment-inspector" label="Reservation details"><button className="equipment-item-link" onClick={()=>{setAdding(false);setSelected('');setEditing(false)}}>Close details</button><h2>{adding?'New reservation':current?.name}</h2>
        {editing?<BookingForm key={adding?'new':`${current!.id}:${current!.version}`} api={api} organizationId={organizationId} inventory={inventory} clients={clients} maxDays={maxDays} admin={admin} reservation={adding?undefined:current} onSaved={saved} onEquipmentAdded={equipmentAdded}/>:current&&<><p>{reservationLabel(current)}</p><p>{dateLabel(current.startsAt)} to {dateLabel(current.endsAt)}</p><ul className="equipment-detail-list">{current.equipmentIds.map(id=><li key={id}>{inventory.find(i=>i.id===id)?.name??'Equipment item'}</li>)}</ul><div className="equipment-detail-actions">{!current.readOnly&&current.status==='confirmed'&&current.fulfillmentStatus!=='returned'&&<><button onClick={()=>setEditing(true)}>Edit / extend reservation</button><Link href={`/check-in-out/?reservation=${current.id}`}>Checkout / return</Link>{current.fulfillmentStatus==='reserved'&&<button disabled={busy} onClick={()=>void cancel()}>Cancel reservation</button>}</>}</div></>}
      </DetailPanel>}
    </div>
  </main>
}
function BookingForm({api,organizationId,inventory,clients,maxDays,admin,reservation,onSaved,onEquipmentAdded}:{api:DatabaseApi;organizationId:string;inventory:EquipmentRecord[];clients:ClientAccount[];maxDays:number;admin:boolean;reservation?:EquipmentReservation;onSaved:(r:EquipmentReservation)=>Promise<void>;onEquipmentAdded:(item:EquipmentRecord)=>void}) {
  const [clientId,setClientId]=useState(reservation?.clientAccountId??'')
  const start=useMemo(()=>new Date(Math.ceil((Date.now()+15*60000)/1800000)*1800000).toISOString(),[])
  const [name,setName]=useState(reservation?.name??''),[startsAt,setStartsAt]=useState(localTime(reservation?.startsAt??start)),[endsAt,setEndsAt]=useState(localTime(reservation?.endsAt??new Date(Date.parse(start)+3600000).toISOString())),[ids,setIds]=useState(reservation?.equipmentIds??[]),[availability,setAvailability]=useState<EquipmentAvailability[]>([]),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[availabilityError,setAvailabilityError]=useState('')
  const mutation=useRef<{key:string;id:string}|null>(null),lifecycle=useMemo(()=>api.equipment(organizationId),[api,organizationId]),valid=Number.isFinite(Date.parse(startsAt))&&Number.isFinite(Date.parse(endsAt))&&Date.parse(endsAt)>Date.parse(startsAt)&&Date.parse(endsAt)-Date.parse(startsAt)<=maxDays*86400000
  useEffect(()=>{let active=true;setChecking(true);setAvailabilityError('');if(!valid){setChecking(false);return}const timer=setTimeout(()=>{allPages(after=>lifecycle.availability(new Date(startsAt).toISOString(),new Date(endsAt).toISOString(),after)).then(rows=>{if(active)setAvailability(rows)}).catch(e=>{if(active)setAvailabilityError(equipmentError(e))}).finally(()=>{if(active)setChecking(false)})},300);return()=>{active=false;clearTimeout(timer)}},[lifecycle,startsAt,endsAt,valid])
  const blocked=new Set(availability.filter(r=>r.id!==reservation?.id).flatMap(r=>r.equipmentIds)),unavailable=ids.some(id=>blocked.has(id)||!inventory.some(i=>i.id===id&&i.status==='available')),out=reservation?.fulfillmentStatus==='checked_out'
  function changeStart(value:string){const previous=Date.parse(startsAt),next=Date.parse(value),length=Date.parse(endsAt)-previous;setStartsAt(value);if(!Number.isFinite(next))return;const keep=Number.isFinite(length)&&length>0&&length<=maxDays*86400000?length:3600000;setEndsAt(localTime(new Date(next+keep).toISOString()))}
  async function submit(e:FormEvent){e.preventDefault();if(busy||checking||!valid||unavailable)return;setBusy(true);setError('');try{const value={clientAccountId:clientId||null,name,startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString(),equipmentIds:[...ids].sort()},key=JSON.stringify({...value,version:reservation?.version});if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};const input={...value,requestId:mutation.current.id},row=reservation?await lifecycle.edit(reservation.id,{...input,version:reservation.version}):await api.createReservation(organizationId,input);mutation.current=null;await onSaved(row)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <form className="equipment-editor" onSubmit={submit}><fieldset disabled={busy}><label>Client account<Select value={clientId} onChange={e=>setClientId(e.target.value)}><option value="">No client / internal use</option>{clients.filter(c=>!c.deletedAt||c.id===clientId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></label><label>Reservation name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} required/></label><label>Starts<input type="datetime-local" value={startsAt} disabled={out} onChange={e=>changeStart(e.target.value)} required/></label><label>Ends<input type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)} required/></label><p className="administration-hint">Times use your device’s local timezone. Maximum {maxDays} days.{out?' Checked-out bookings keep their start and equipment.':''}</p>
    {!valid&&<p role="alert">Choose an end after the start, within {maxDays} days.</p>}{availabilityError&&<p role="alert">{availabilityError}</p>}{checking&&<p role="status">Checking availability…</p>}
    <fieldset disabled={out}><legend>Equipment</legend><div className="equipment-pick-list">{!inventory.length&&<p className="administration-hint">No equipment in this organization yet.{admin?' Add an item below to reserve it.':<> <Link href="/inventory/">Add items in Equipment</Link> or ask an organization admin to add them.</>}</p>}{inventory.map(i=><label className="administration-checkbox" key={i.id}><input type="checkbox" checked={ids.includes(i.id)} disabled={(blocked.has(i.id)||i.status!=='available')&&!ids.includes(i.id)} onChange={e=>setIds(current=>e.target.checked?[...current,i.id]:current.filter(id=>id!==i.id))}/><span>{i.name}<small>{i.equipmentCode} · {blocked.has(i.id)?'Reserved during these dates':i.status}{i.checkedOut?' · Currently checked out':''}</small></span></label>)}</div>{admin&&!out&&<QuickAddEquipment api={api} organizationId={organizationId} startOpen={!inventory.length} onAdded={item=>{onEquipmentAdded(item);setIds(current=>[...current,item.id])}}/>}</fieldset>
    {unavailable&&<p role="alert">Selected equipment is unavailable. Choose another item or different dates.</p>}{error&&<p role="alert">{error}</p>}<button disabled={busy||checking||!valid||!ids.length||unavailable||Boolean(availabilityError)}>{busy?'Saving reservation…':reservation?'Save reservation':'Create reservation'}</button>
  </fieldset></form>
}
/** Lets an admin add an item without leaving the booking. It is not a nested <form>, so Enter is handled here instead of submitting the reservation. */
function QuickAddEquipment({api,organizationId,startOpen,onAdded}:{api:DatabaseApi;organizationId:string;startOpen:boolean;onAdded:(item:EquipmentRecord)=>void}) {
  const [open,setOpen]=useState(startOpen),[name,setName]=useState(''),[category,setCategory]=useState<EquipmentCategory>(equipmentCategories[0]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  async function add(){if(busy)return;const trimmed=name.trim();if(!trimmed){setError('Enter a name for the equipment.');return}setBusy(true);setError('');setNotice('');try{const item=await api.createEquipment(organizationId,{equipmentCode:generatedEquipmentCode(category),name:trimmed,category});onAdded(item);setName('');setNotice(`${item.name} added and selected.`)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  function enter(e:KeyboardEvent){if(e.key==='Enter'){e.preventDefault();void add()}}
  if(!open)return <div className="equipment-quick-add">{notice&&<p role="status">{notice}</p>}<button type="button" onClick={()=>{setOpen(true);setNotice('')}}>Add equipment</button></div>
  return <div className="equipment-quick-add" role="group" aria-label="Add equipment"><label>Equipment name<input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)} onKeyDown={enter}/></label><label>Category<Select value={category} disabled={busy} onChange={e=>setCategory(e.target.value as EquipmentCategory)}>{equipmentCategories.map(c=><option key={c}>{c}</option>)}</Select></label><p className="administration-hint">A label code is generated for you. Add a photo or print the QR label later from Equipment.</p>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}<div className="equipment-quick-add-actions"><button type="button" className="ws-button-primary" disabled={busy} onClick={()=>void add()}>{busy?'Adding equipment…':'Add equipment'}</button>{!startOpen&&<button type="button" disabled={busy} onClick={()=>setOpen(false)}>Done</button>}</div></div>
}
