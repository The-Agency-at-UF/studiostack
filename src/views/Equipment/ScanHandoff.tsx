'use client'
import {useState} from 'react'
import {allPages,equipmentError,type DatabaseApi} from './live'
import type {EquipmentRecord,EquipmentReservation} from '../../types/equipment'
import {ConditionForm} from './Fulfillment'
import {reservationLabel} from './Reservations'
import EquipmentQrScanner from '../../components/EquipmentQrScanner'
import {agencyCampus} from '../../types/campus'
export type ScannedHandoff={kind:'checkout'|'return';reservation:EquipmentReservation}|{kind:'none';reason:string}
/** Picks the reservation a scanned item belongs to: its open checkout when it is out, otherwise the earliest pickup that is open now. */
export function handoffFor(item:EquipmentRecord,reservations:EquipmentReservation[],now:number):ScannedHandoff{
  const mine=reservations.filter(r=>r.status==='confirmed'&&r.equipmentIds.includes(item.id))
  if(item.checkedOut){const reservation=mine.find(r=>r.fulfillmentStatus==='checked_out');return reservation?{kind:'return',reservation}:{kind:'none',reason:`${item.name} is checked out on a reservation you cannot return. Ask a production administrator to return it.`}}
  if(item.status!=='available')return {kind:'none',reason:`${item.name} is ${item.status==='maintenance'?'in maintenance':'retired'} and cannot be checked out.`}
  const upcoming=mine.filter(r=>r.fulfillmentStatus==='reserved'&&Date.parse(r.endsAt)>now).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)),ready=upcoming.find(r=>Date.parse(r.startsAt)<=now+15*60000)
  if(ready)return {kind:'checkout',reservation:ready}
  return {kind:'none',reason:upcoming[0]?`Pickup for ${upcoming[0].name} opens 15 minutes before ${new Date(upcoming[0].startsAt).toLocaleString()}.`:`No reservation includes ${item.name}. Book it before checking it out.`}
}
type Scan={item:EquipmentRecord;handoff:ScannedHandoff}|{unknown:string}
export default function ScanHandoff({api,organizationId,items,admin,onAdd,onSaved,onClose}:{api:DatabaseApi;organizationId:string;items:EquipmentRecord[];admin:boolean;onAdd:(code:string)=>void;onSaved:()=>Promise<void>;onClose:()=>void}){
  const [camera,setCamera]=useState(true),[code,setCode]=useState(''),[scan,setScan]=useState<Scan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  function lookUp(value:string){
    const trimmed=value.trim();if(!trimmed)return false
    const item=items.find(i=>i.equipmentCode===trimmed);setCamera(false);setCode('');setError('');setNotice('')
    if(!item){setScan({unknown:trimmed});return true}
    setBusy(true)
    allPages(after=>api.reservations(organizationId,{limit:100,after})).then(rows=>setScan({item,handoff:handoffFor(item,rows,Date.now())})).catch(e=>setError(equipmentError(e))).finally(()=>setBusy(false))
    return true
  }
  function again(){setScan(null);setError('');setCamera(true)}
  async function saved(row:EquipmentReservation,damaged:boolean){
    const name=scan&&'item' in scan?scan.item.name:'Equipment'
    setNotice(row.fulfillmentStatus==='returned'?`${name} returned${damaged?'. A damage report was created and damaged items were placed in maintenance':''}.`:`${name} checked out on ${row.name}.`);setScan(null)
    await onSaved()
  }
  return <section className="equipment-scan" aria-label="Scan equipment"><div className="equipment-scan-header"><div><h2>Scan equipment</h2><p className="administration-hint">Scan a label to check equipment out or return it. Your location is confirmed on campus near {agencyCampus.name}.</p></div><button type="button" className="equipment-item-link" onClick={onClose}>Close scanner</button></div>
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Finding the reservation…</p>}
    {!scan&&!busy&&<>{camera?<EquipmentQrScanner onCancel={()=>setCamera(false)} onCode={lookUp}/>:<button type="button" onClick={()=>setCamera(true)}>Use camera</button>}
      <form className="equipment-scan-manual" onSubmit={e=>{e.preventDefault();lookUp(code)}}><label>Or enter equipment code<input value={code} autoComplete="off" onChange={e=>setCode(e.target.value)}/></label><button>Look up equipment</button></form></>}
    {scan&&'unknown' in scan&&<div><p role="alert">No equipment uses the code {scan.unknown}.</p>{admin&&<button type="button" className="ws-button-primary" onClick={()=>onAdd(scan.unknown)}>Add {scan.unknown} as new equipment</button>}<button type="button" onClick={again}>Scan another item</button></div>}
    {scan&&'item' in scan&&<div><h3>{scan.handoff.kind==='return'?'Return':scan.handoff.kind==='checkout'?'Check out':''} {scan.item.name}</h3><small>{scan.item.equipmentCode}</small>
      {scan.handoff.kind==='none'?<p role="alert">{scan.handoff.reason}</p>:<><p>{scan.handoff.reservation.name} · {reservationLabel(scan.handoff.reservation)}</p>{scan.handoff.reservation.equipmentIds.length>1&&<p className="administration-hint">This reservation has {scan.handoff.reservation.equipmentIds.length} items. Record the condition of each one.</p>}
        <ConditionForm key={scan.handoff.reservation.id+':'+scan.handoff.reservation.version} api={api} organizationId={organizationId} reservation={scan.handoff.reservation} items={items.filter(i=>scan.handoff.kind!=='none'&&scan.handoff.reservation.equipmentIds.includes(i.id))} initialScanned={[scan.item.id]} onSaved={saved}/></>}
      <button type="button" onClick={again}>Scan another item</button></div>}
  </section>
}
