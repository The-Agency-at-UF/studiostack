'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import {equipmentConditions,type EquipmentRecord,type EquipmentReservation,type EquipmentEvent,type ItemCondition} from '../../types/equipment'
import {reservationLabel} from './Reservations'
import EquipmentQrScanner from '../../components/EquipmentQrScanner'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import '../Accounts/Administration.css'
import './Equipment.css'
type CachedFulfillment = { rows: EquipmentReservation[]; items: EquipmentRecord[] }
export default function LiveFulfillment(){const context=useLiveOrganization();return context?<FulfillmentWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id}/>:<main className="administration"><h1>Pickup & return</h1><p>Select an active organization in your account.</p></main>}
function FulfillmentWorkspace({api,organizationId}:{api:DatabaseApi;organizationId:string}){
  const cacheKey = `fulfillment:${organizationId}`
  const cached = getCached<CachedFulfillment>(cacheKey)
  const cachedReservations = getCached<{ bookings: EquipmentReservation[]; items: EquipmentRecord[] }>(`reservations:${organizationId}`)
  const cachedInventory = getCached<EquipmentRecord[]>(`inventory:${organizationId}`)

  const initialRows = cached?.rows ?? cachedReservations?.bookings ?? []
  const initialItems = cached?.items ?? cachedReservations?.items ?? cachedInventory ?? []

  const [rows,setRows]=useState<EquipmentReservation[]>(initialRows),[items,setItems]=useState<EquipmentRecord[]>(initialItems),[selected,setSelected]=useState(''),[loading,setLoading]=useState(!cached && !cachedReservations),[error,setError]=useState(''),[notice,setNotice]=useState(''),[history,setHistory]=useState<EquipmentEvent[]>([]),[historyError,setHistoryError]=useState('')
  const lifecycle=useMemo(()=>api.equipment(organizationId),[api,organizationId])
  const load=useCallback(async()=>{
    const [rows,items]=await Promise.all([
      allPages(after=>api.reservations(organizationId,{limit:100,after})),
      allPages(after=>api.inventory(organizationId,{limit:100,after}))
    ])
    return {rows,items}
  },[api,organizationId])
  useEffect(()=>{let active=true;load().then(value=>{if(!active)return;setRows(value.rows);setItems(value.items);setCached(cacheKey,{rows:value.rows,items:value.items});const id=new URLSearchParams(window.location.search).get('reservation');if(id&&value.rows.some(r=>r.id===id))setSelected(id)}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,cacheKey])
  const current=rows.find(r=>r.id===selected)
  useEffect(()=>{let active=true;setHistory([]);setHistoryError('');if(selected)allPages(after=>lifecycle.activity(selected,after)).then(value=>{if(active)setHistory(value)}).catch(()=>{if(active)setHistoryError('Equipment activity could not be loaded. Refresh to try again.')});return()=>{active=false}},[lifecycle,selected,current?.version])
  async function refresh(){setLoading(true);setError('');try{const value=await load();setRows(value.rows);setItems(value.items);setCached(cacheKey,{rows:value.rows,items:value.items})}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
  async function saved(row:EquipmentReservation,damaged:boolean){
    invalidateCache(`fulfillment:${organizationId}`)
    invalidateCache(`reservations:${organizationId}`)
    invalidateCache(`inventory:${organizationId}`)
    invalidateCache(`dashboard:${organizationId}`)
    if (damaged) invalidateCache(`reports:${organizationId}`)
    setRows(value=>value.map(r=>r.id===row.id?row:r));setNotice(row.fulfillmentStatus==='returned'?(damaged?'Equipment returned. A damage report was created and damaged items were placed in maintenance.':'Equipment returned.'):'Equipment checked out.');try{const value=await load();setRows(value.rows);setItems(value.items);setCached(cacheKey,{rows:value.rows,items:value.items})}catch(e){setError(equipmentError(e))}
  }
  return <main className="administration workspace-surface"><header><div><p className="administration-eyebrow">Equipment handoff</p><h1>Pickup & return</h1><p>Record the condition of every item at pickup and return.</p></div><button disabled={loading} onClick={()=>void refresh()}>Refresh</button></header>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading equipment handoffs…</p>}
    <label className="equipment-booking-select">Reservation<select value={selected} onChange={e=>{setSelected(e.target.value);setNotice('')}}><option value="">Choose a reservation</option>{[...rows].sort((a,b)=>Date.parse(b.startsAt)-Date.parse(a.startsAt)).map(r=><option key={r.id} value={r.id}>{r.name} · {reservationLabel(r)}</option>)}</select></label>
    {!loading&&!rows.length&&<p>No reservations yet. <Link href="/create-reservation/">Book equipment</Link> to get started.</p>}
    {current&&!loading&&<div className="equipment-handoff-layout"><section><h2>{current.name}</h2><p>{reservationLabel(current)} · {new Date(current.startsAt).toLocaleString()} to {new Date(current.endsAt).toLocaleString()}</p>
      {current.checkedOutAt&&<p className="administration-hint">Picked up {new Date(current.checkedOutAt).toLocaleString()}</p>}{current.returnedAt&&<p className="administration-hint">Returned {new Date(current.returnedAt).toLocaleString()}</p>}
      {current.status==='confirmed'&&current.fulfillmentStatus!=='returned'?<ConditionForm key={current.id+':'+current.version} api={api} organizationId={organizationId} reservation={current} items={items.filter(i=>current.equipmentIds.includes(i.id))} onSaved={saved}/>:<p className="equipment-empty">This reservation is closed. Its condition history remains available.</p>}
    </section><section><h2>Condition & activity history</h2>{historyError&&<p role="alert">{historyError}</p>}<ol className="equipment-history">{[...history].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(event=><li key={event.id}><strong>{event.kind.replaceAll('_',' ')}</strong><small>{event.actorName} · {new Date(event.createdAt).toLocaleString()}</small>{Array.isArray(event.details.conditions)&&(event.details.conditions as ItemCondition[]).map(c=><p key={c.equipmentId}>{items.find(i=>i.id===c.equipmentId)?.name??'Equipment'} · {c.condition}{c.notes&&<span>{c.notes}</span>}</p>)}</li>)}</ol>{!history.length&&!historyError&&<p>No equipment activity recorded yet.</p>}</section></div>}
  </main>
}
function ConditionForm({api,organizationId,reservation:r,items,onSaved}:{api:DatabaseApi;organizationId:string;reservation:EquipmentReservation;items:EquipmentRecord[];onSaved:(row:EquipmentReservation,damaged:boolean)=>Promise<void>}){
  const returning=r.fulfillmentStatus==='checked_out',[conditions,setConditions]=useState<ItemCondition[]>(r.equipmentIds.map(id=>({equipmentId:id,condition:items.find(i=>i.id===id)?.condition??'good',notes:''}))),[busy,setBusy]=useState(false),[error,setError]=useState(''),[scan,setScan]=useState(false),[matched,setMatched]=useState(''),[scannerCode,setScannerCode]=useState(''),[scanned,setScanned]=useState<string[]>([]),[clock,setClock]=useState(Date.now())
  function recordScan(code:string){const item=items.find(i=>i.equipmentCode===code.trim());if(!item){setError('That equipment code is not part of this reservation.');return false}setScanned(v=>v.includes(item.id)?v:[...v,item.id]);setMatched(item.name+' matched this reservation.');setScannerCode('');setError('');setScan(false);return true}
  const mutation=useRef<{key:string;id:string}|null>(null)
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer)},[])
  const ready=returning||Date.parse(r.startsAt)<=clock+15*60000&&Date.parse(r.endsAt)>clock,blocked=!returning&&(items.length!==r.equipmentIds.length||items.some(i=>i.status!=='available'||i.checkedOut)||conditions.some(c=>c.condition==='damaged'))
  function update(id:string,value:Partial<ItemCondition>){setConditions(rows=>rows.map(row=>row.equipmentId===id?{...row,...value}:row))}
  async function submit(e:FormEvent){e.preventDefault();if(busy||!ready||blocked||scan)return;setBusy(true);setError('');try{const value={version:r.version,conditions},key=JSON.stringify(value);if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};const client=api.equipment(organizationId),row=await (returning?client.return:client.checkout)(r.id,{...value,requestId:mutation.current.id});mutation.current=null;await onSaved(row,conditions.some(c=>c.condition==='damaged'))}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <form className="equipment-condition-form" onSubmit={submit}><fieldset disabled={busy}><label>Scan or enter equipment code<input value={scannerCode} autoComplete="off" onChange={e=>setScannerCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();recordScan(scannerCode)}}}/></label><button type="button" onClick={()=>recordScan(scannerCode)}>Match equipment code</button><p>{scanned.length} of {items.length} labels matched. USB/Bluetooth scanners can type here and press Enter. You can also enter a label manually.</p><button type="button" onClick={()=>setScan(true)}>Scan equipment code</button>{scan&&<EquipmentQrScanner onCancel={()=>setScan(false)} onCode={recordScan}/>}{matched&&<p role="status">{matched}</p>}
    {conditions.map(c=><div className="equipment-condition-row" key={c.equipmentId}><div><strong>{items.find(i=>i.id===c.equipmentId)?.name??'Equipment item'}{scanned.includes(c.equipmentId)?' · Label matched':''}</strong><small>{items.find(i=>i.id===c.equipmentId)?.equipmentCode??c.equipmentId}</small></div><label>Condition for {items.find(i=>i.id===c.equipmentId)?.name??'equipment'}<select value={c.condition} onChange={e=>update(c.equipmentId,{condition:e.target.value as ItemCondition['condition']})}>{equipmentConditions.map(value=><option key={value}>{value}</option>)}</select></label><label>Notes for {items.find(i=>i.id===c.equipmentId)?.name??'equipment'}<textarea maxLength={1000} value={c.notes} onChange={e=>update(c.equipmentId,{notes:e.target.value})} required={returning&&c.condition==='damaged'}/></label></div>)}
    {!ready&&<p>Pickup opens 15 minutes before the reservation starts and closes at its end.</p>}{blocked&&<p role="alert">Equipment is damaged, out of service or still checked out. Resolve its status before pickup.</p>}{returning&&<p className="administration-hint">Describe any damage. Damaged returns create a report and remove the affected items from service.</p>}{error&&<p role="alert">{error}</p>}<button disabled={busy||!ready||blocked||scan}>{busy?'Saving handoff…':returning?'Return equipment':'Check out equipment'}</button>
  </fieldset></form>
}
