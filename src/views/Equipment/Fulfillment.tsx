'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {sameEquipmentCode} from './equipmentCode'
import type {FormEvent} from 'react'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import {equipmentConditions,type EquipmentRecord,type EquipmentReservation,type EquipmentEvent,type ItemCondition} from '../../types/equipment'
import {reservationLabel} from './Reservations'
import EquipmentQrScanner from '../../components/EquipmentQrScanner'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {currentLocation,LocationError} from '../../api/location'
import {agencyCampus,campusProximity,campusProximityMessage,type DeviceLocation} from '../../types/campus'
import { Select, Skeleton, Notice, Button, FieldError } from '../../components/workspace/WorkspaceUI'
import ScanHandoff from './ScanHandoff'
import {useRouter} from 'next/navigation'
import {useToast} from '../../components/workspace/Toast'
import { dateTimeLabel, statusLabel, titleCase } from '../../format'
type CachedFulfillment = { rows: EquipmentReservation[]; items: EquipmentRecord[] }
export default function LiveFulfillment(){const context=useLiveOrganization();return context?<FulfillmentWorkspace key={context.organization.id} api={context.api} organizationId={context.organization.id} admin={context.admin}/>:<main className="administration"><h1>Pickup & return</h1><p>Select an active organization in your account.</p></main>}
/** Which reservations the desk can act on right now, in the order they're needed. */
function handoffGroup(r:EquipmentReservation,now:number):'overdue'|'ready'|'out'|'later'|'closed'{
  if(r.status!=='confirmed'||r.fulfillmentStatus==='returned')return 'closed'
  if(r.fulfillmentStatus==='checked_out')return Date.parse(r.endsAt)<now?'overdue':'out'
  if(Date.parse(r.endsAt)<=now)return 'closed'
  return Date.parse(r.startsAt)<=now+15*60000?'ready':'later'
}
const groupLabels={overdue:'Overdue returns',ready:'Ready for pickup now',out:'Out now',later:'Later pickups',closed:'Closed reservations'} as const
function FulfillmentWorkspace({api,organizationId,admin=false}:{api:DatabaseApi;organizationId:string;admin?:boolean}){
  const cacheKey = `fulfillment:${organizationId}`
  const cached = getCached<CachedFulfillment>(cacheKey)
  const cachedReservations = getCached<{ bookings: EquipmentReservation[]; items: EquipmentRecord[] }>(`reservations:${organizationId}`)
  const cachedInventory = getCached<EquipmentRecord[]>(`inventory:${organizationId}`)

  const initialRows = cached?.rows ?? cachedReservations?.bookings ?? []
  const initialItems = cached?.items ?? cachedReservations?.items ?? cachedInventory ?? []

  const [rows,setRows]=useState<EquipmentReservation[]>(initialRows),[items,setItems]=useState<EquipmentRecord[]>(initialItems),[selected,setSelected]=useState(''),[loading,setLoading]=useState(!cached && !cachedReservations),[error,setError]=useState(''),toast=useToast(),[history,setHistory]=useState<EquipmentEvent[]>([]),[historyError,setHistoryError]=useState(''),[historyLoading,setHistoryLoading]=useState(false),[showClosed,setShowClosed]=useState(false),[refreshing,setRefreshing]=useState(false)
  // Without a reservation in the address the page opens on the scanner: scan a label to find its reservation.
  const [scanning,setScanning]=useState(()=>typeof window==='undefined'||!new URLSearchParams(window.location.search).get('reservation'))
  const router=useRouter()
  const lifecycle=useMemo(()=>api.equipment(organizationId),[api,organizationId])
  const load=useCallback(async()=>{
    const [rows,items]=await Promise.all([
      allPages(after=>api.reservations(organizationId,{limit:100,after})),
      allPages(after=>api.inventory(organizationId,{limit:100,after}))
    ])
    return {rows,items}
  },[api,organizationId])
  useEffect(()=>{let active=true;load().then(value=>{if(!active)return;setRows(value.rows);setItems(value.items);setCached(cacheKey,{rows:value.rows,items:value.items});const id=new URLSearchParams(window.location.search).get('reservation');if(id&&value.rows.some(r=>r.id===id))setSelected(id)}).catch(e=>{if(active)setError(equipmentError(e,'load'))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,cacheKey])
  const current=rows.find(r=>r.id===selected)
  const [historyAttempt,setHistoryAttempt]=useState(0)
  useEffect(()=>{let active=true;setHistory([]);setHistoryError('');if(!selected){setHistoryLoading(false);return}setHistoryLoading(true);allPages(after=>lifecycle.activity(selected,after)).then(value=>{if(active)setHistory(value)}).catch(()=>{if(active)setHistoryError('Equipment activity couldn’t load.')}).finally(()=>{if(active)setHistoryLoading(false)});return()=>{active=false}},[lifecycle,selected,current?.version,historyAttempt])
  // Refresh keeps the open form (and its label matches) on screen; progress shows as a status line.
  async function refresh(){setRefreshing(true);setError('');try{const value=await load();setRows(value.rows);setItems(value.items);setCached(cacheKey,{rows:value.rows,items:value.items})}catch(e){setError(equipmentError(e,'load'))}finally{setRefreshing(false)}}
  const now=Date.now()
  const grouped=(['overdue','ready','out','later','closed'] as const).map(group=>[group,rows.filter(r=>handoffGroup(r,now)===group).sort((a,b)=>group==='closed'?Date.parse(b.startsAt)-Date.parse(a.startsAt):Date.parse(group==='overdue'||group==='out'?a.endsAt:a.startsAt)-Date.parse(group==='overdue'||group==='out'?b.endsAt:b.startsAt))] as const).filter(([group,list])=>list.length&&(group!=='closed'||showClosed||list.some(r=>r.id===selected)))
  const open=rows.filter(r=>handoffGroup(r,now)!=='closed').length
  async function saved(row:EquipmentReservation,damaged:boolean){
    invalidateCache(`fulfillment:${organizationId}`)
    invalidateCache(`reservations:${organizationId}`)
    invalidateCache(`inventory:${organizationId}`)
    invalidateCache(`dashboard:${organizationId}`)
    if (damaged) invalidateCache(`reports:${organizationId}`)
    setRows(value=>value.map(r=>r.id===row.id?row:r));toast.success(row.fulfillmentStatus==='returned'?(damaged?'Equipment returned. A damage report was created and damaged items were placed in maintenance.':'Equipment returned.'):'Equipment checked out.');try{const value=await load();setRows(value.rows);setItems(value.items);setCached(cacheKey,{rows:value.rows,items:value.items})}catch(e){setError(equipmentError(e))}
  }
  return <main className="administration workspace-surface"><header><div><h1>Pickup & return</h1></div><div className="administration-actions">{!scanning&&<button type="button" className="ws-button-primary" onClick={()=>{setScanning(true);setSelected('')}}>Scan equipment</button>}<button type="button" disabled={loading||refreshing} onClick={()=>void refresh()}>{refreshing?'Refreshing…':'Refresh'}</button></div></header>
    {error&&<Notice kind="error" action={<Button disabled={refreshing} onClick={()=>void refresh()}>{refreshing?'Retrying…':'Retry'}</Button>}>{error}</Notice>}
    {refreshing&&<p className="administration-hint" role="status">Refreshing reservations…</p>}
    {scanning&&<ScanHandoff api={api} organizationId={organizationId} items={items} admin={admin} onClose={()=>setScanning(false)} onAdd={code=>router.push(`/inventory/?add=${encodeURIComponent(code)}`)} onSaved={async()=>{for(const key of ['fulfillment','reservations','inventory','dashboard','reports'])invalidateCache(`${key}:${organizationId}`);await refresh()}}/>}
    <div className="equipment-booking-picker">{scanning&&<p className="administration-hint">No label to scan? Choose the reservation instead.</p>}<label className="equipment-booking-select">Reservation<Select value={selected} onChange={e=>{setSelected(e.target.value);if(e.target.value)setScanning(false)}}><option value="">{open?`Choose a reservation (${open} open)`:'Choose a reservation'}</option>{grouped.map(([group,list])=><optgroup key={group} label={groupLabels[group]}>{list.map(r=><option key={r.id} value={r.id}>{r.name}, {group==='overdue'||group==='out'?`due ${dateTimeLabel(r.endsAt)}`:dateTimeLabel(r.startsAt)}{group==='closed'?`, ${reservationLabel(r)}`:''}</option>)}</optgroup>)}</Select></label>
      <label className="administration-checkbox"><input type="checkbox" checked={showClosed} onChange={e=>setShowClosed(e.target.checked)}/>Show closed reservations</label></div>
    {loading&&!rows.length&&<Skeleton label="Loading equipment handoffs…" variant="row" count={3}/>}
    {!loading&&!error&&!rows.length&&<p>No reservations yet. <Link href="/create-reservation/">Book gear</Link> to get started.</p>}
    {!loading&&!error&&rows.length>0&&!open&&!showClosed&&<p className="equipment-empty">No reservations are open for pickup or return. Turn on Show closed reservations to see past ones.</p>}
    {current&&<div className="equipment-handoff-layout"><section><h2>{current.name}</h2><p>{reservationLabel(current)}, {dateTimeLabel(current.startsAt)} to {dateTimeLabel(current.endsAt)}</p>
      {current.checkedOutAt&&<p className="administration-hint">Picked up {dateTimeLabel(current.checkedOutAt)}</p>}{current.returnedAt&&<p className="administration-hint">Returned {dateTimeLabel(current.returnedAt)}</p>}
      {current.status==='confirmed'&&current.fulfillmentStatus!=='returned'?<ConditionForm key={current.id+':'+current.fulfillmentStatus} api={api} organizationId={organizationId} reservation={current} items={items.filter(i=>current.equipmentIds.includes(i.id))} onSaved={saved}/>:<p className="equipment-empty">This reservation is closed. Its condition history remains available.</p>}
    </section><section><h2>Condition & activity history</h2>{historyError&&<Notice kind="error" action={<Button onClick={()=>setHistoryAttempt(n=>n+1)}>Retry</Button>}>{historyError}</Notice>}{historyLoading&&!history.length&&<Skeleton label="Loading activity…" variant="row" count={3}/>}<ol className="equipment-history ws-stagger">{[...history].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(event=><li key={event.id}><strong>{statusLabel(event.kind)}</strong><small>{event.actorName} on {dateTimeLabel(event.createdAt)}</small>{Array.isArray(event.details.conditions)&&(event.details.conditions as ItemCondition[]).map(c=><p key={c.equipmentId}>{items.find(i=>i.id===c.equipmentId)?.name??'Equipment'}, {titleCase(c.condition)}{c.notes&&<span>{c.notes}</span>}</p>)}</li>)}</ol>{!history.length&&!historyError&&!historyLoading&&<p>No equipment activity recorded yet.</p>}</section></div>}
  </main>
}
/** Steps to turn location back on. A browser that was told "no" won't ask again, so retrying alone can't fix it. */
function LocationHelp({reason,accuracy,onRetry,busy}:{reason:'denied'|'unavailable'|'unsupported'|'imprecise';accuracy:number|null;onRetry:()=>void;busy:boolean}){
  const apple=typeof navigator!=='undefined'&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.userAgent.includes('Macintosh')&&navigator.maxTouchPoints>1)
  const steps={
    safari:<li><strong>iPhone or iPad (Safari):</strong> tap <b>aA</b> in the address bar, choose <b>Website Settings</b>, set <b>Location</b> to <b>Allow</b>. If Location isn’t listed, open <b>Settings → Privacy &amp; Security → Location Services</b> and turn on <b>Safari Websites</b> with <b>Precise Location</b>.</li>,
    chrome:<li><strong>Chrome (Android or computer):</strong> tap the <b>site settings icon</b> left of the address, choose <b>Permissions → Location → Allow</b>. On Android, also turn on <b>Use precise location</b> for Chrome in the phone’s settings.</li>,
  }
  return <div className="equipment-location-help" role="alert">
    <p><strong>{reason==='denied'?'Location access is off for StudioStack.':reason==='imprecise'?'Your location isn’t precise enough to confirm you’re on campus.':reason==='unsupported'?'This browser can’t share its location.':'Your location couldn’t be determined.'}</strong> {reason==='unsupported'?'Use a phone or a browser with location services.':'Pickups and returns are confirmed on campus.'}{accuracy!==null&&` Last reading was accurate to about ${Math.round(accuracy).toLocaleString()} m; it needs to be within ${agencyCampus.maxAccuracyMeters.toLocaleString()} m.`}</p>
    {reason!=='unsupported'&&<><p>To turn it on:</p><ol>{apple?<>{steps.safari}{steps.chrome}</>:<>{steps.chrome}{steps.safari}</>}</ol><p>Indoors, move near a window or step outside for a moment.</p></>}
    <Button disabled={busy} onClick={onRetry}>{busy?'Checking location…':'Try location again'}</Button>
  </div>
}
export function ConditionForm({api,organizationId,reservation:r,items,onSaved,initialScanned=[],onBusyChange}:{api:DatabaseApi;organizationId:string;reservation:EquipmentReservation;items:EquipmentRecord[];onSaved:(row:EquipmentReservation,damaged:boolean)=>Promise<void>;initialScanned?:string[];onBusyChange?:(busy:boolean)=>void}){
  const [previewOnCampus,setPreviewOnCampus]=useState(true)
  const returning=r.fulfillmentStatus==='checked_out',[conditions,setConditions]=useState<ItemCondition[]>(r.equipmentIds.map(id=>({equipmentId:id,condition:items.find(i=>i.id===id)?.condition??'good',notes:''}))),[busy,setBusy]=useState(false),[error,setError]=useState(''),[scan,setScan]=useState(false),[matched,setMatched]=useState(''),[scannerCode,setScannerCode]=useState(''),[scanned,setScanned]=useState<string[]>(initialScanned),[clock,setClock]=useState(Date.now()),[locating,setLocating]=useState(false),[locationIssue,setLocationIssue]=useState<{reason:'denied'|'unavailable'|'unsupported'|'imprecise';accuracy:number|null}|null>(null)
  const form=useRef<HTMLFormElement>(null)
  useEffect(()=>{onBusyChange?.(busy)},[busy,onBusyChange])
  function recordScan(code:string){const item=items.find(i=>sameEquipmentCode(i.equipmentCode,code));if(!item){setError(code.trim()?`${code.trim()} is not part of this reservation. Scan the next label.`:'Enter or scan an equipment code.');setScannerCode('');return false}setScanned(v=>v.includes(item.id)?v:[...v,item.id]);setMatched(item.name+' matched this reservation.');setScannerCode('');setError('');setScan(false);return true}
  const mutation=useRef<{key:string;id:string}|null>(null)
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);return()=>clearInterval(timer)},[])
  // Locating starts as soon as the handoff can proceed, so submitting rarely waits on GPS. A fix is reused for one minute; failures are retried on submit.
  const located=useRef<{at:number;fix:Promise<DeviceLocation>}|null>(null)
  const locate=useCallback(()=>{const at=Date.now();if(!located.current||at-located.current.at>60000){const fix=organizationId==='preview'?Promise.resolve({latitude:agencyCampus.latitude+(previewOnCampus?0:1),longitude:agencyCampus.longitude,accuracy:25}):currentLocation();fix.catch(()=>{if(located.current?.fix===fix)located.current=null});located.current={at,fix}}return located.current.fix},[organizationId,previewOnCampus])
  useEffect(()=>{located.current=null},[previewOnCampus])
  const ready=returning||Date.parse(r.startsAt)<=clock+15*60000&&Date.parse(r.endsAt)>clock,blocked=!returning&&(items.length!==r.equipmentIds.length||items.some(i=>i.status!=='available'||i.checkedOut)||conditions.some(c=>c.condition==='damaged'))
  useEffect(()=>{if(ready&&!blocked)locate().catch(()=>undefined)},[locate,ready,blocked])
  function update(id:string,value:Partial<ItemCondition>){setConditions(rows=>rows.map(row=>row.equipmentId===id?{...row,...value}:row))}
  const unmatched=r.equipmentIds.filter(id=>!scanned.includes(id))
  // Damaged returns need a note on each damaged item, shown on that item's field.
  const [noteNeeded,setNoteNeeded]=useState<string[]>([])
  async function submit(e:FormEvent){e.preventDefault();if(busy||!ready||blocked||scan||unmatched.length)return;const unnoted=returning?conditions.filter(c=>c.condition==='damaged'&&!c.notes.trim()).map(c=>c.equipmentId):[];setNoteNeeded(unnoted);if(unnoted.length){document.getElementById(`notes-${unnoted[0]}`)?.focus();return}setBusy(true);setError('');setLocationIssue(null);try{setLocating(true);const location=await locate();setLocating(false);const proximity=campusProximity(location);if(!proximity.allowed){if(proximity.reason==='imprecise'){located.current=null;setLocationIssue({reason:'imprecise',accuracy:location.accuracy})}else setError(campusProximityMessage(proximity));return}const value={version:r.version,conditions},key=JSON.stringify(value);if(mutation.current?.key!==key)mutation.current={key,id:crypto.randomUUID()};const client=api.equipment(organizationId),row=await (returning?client.return:client.checkout)(r.id,{...value,location,requestId:mutation.current.id});mutation.current=null;await onSaved(row,conditions.some(c=>c.condition==='damaged'))}catch(e){if(e instanceof LocationError)setLocationIssue({reason:e.reason,accuracy:null});else setError(equipmentError(e))}finally{setLocating(false);setBusy(false)}}
  return <form ref={form} className="equipment-condition-form" noValidate onSubmit={submit}><fieldset disabled={busy}><label>Scan or enter equipment code<input value={scannerCode} autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="go" maxLength={128} onChange={e=>setScannerCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();recordScan(scannerCode)}}}/></label><button type="button" onClick={()=>recordScan(scannerCode)}>Match equipment code</button><p>{r.equipmentIds.length-unmatched.length} of {r.equipmentIds.length} labels matched. USB/Bluetooth scanners can type here and press Enter. You can also enter a label manually.</p><button type="button" onClick={()=>setScan(true)}>Scan equipment code</button>{scan&&<EquipmentQrScanner onCancel={()=>setScan(false)} onCode={recordScan}/>}{matched&&<p role="status">{matched}</p>}
    {conditions.map(c=><div className="equipment-condition-row" key={c.equipmentId}><div><strong>{items.find(i=>i.id===c.equipmentId)?.name??'Equipment item'}{scanned.includes(c.equipmentId)?' (Label matched)':''}</strong><small>{items.find(i=>i.id===c.equipmentId)?.equipmentCode??c.equipmentId}</small></div><label>Condition for {items.find(i=>i.id===c.equipmentId)?.name??'equipment'}<Select value={c.condition} onChange={e=>update(c.equipmentId,{condition:e.target.value as ItemCondition['condition']})}>{equipmentConditions.map(value=><option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}</option>)}</Select></label><label>Notes for {items.find(i=>i.id===c.equipmentId)?.name??'equipment'}<textarea id={`notes-${c.equipmentId}`} maxLength={1000} value={c.notes} onChange={e=>{update(c.equipmentId,{notes:e.target.value});setNoteNeeded(n=>n.filter(id=>id!==c.equipmentId))}} required={returning&&c.condition==='damaged'} aria-invalid={noteNeeded.includes(c.equipmentId)||undefined} aria-describedby={noteNeeded.includes(c.equipmentId)?`notes-${c.equipmentId}-error`:undefined}/></label>{noteNeeded.includes(c.equipmentId)&&<FieldError id={`notes-${c.equipmentId}-error`}>Describe the damage so the report has what the repair needs.</FieldError>}</div>)}
    {!ready&&<p>Pickup opens 15 minutes before the reservation starts and closes at its end.</p>}{blocked&&<p role="alert">Equipment is damaged, out of service or still checked out. Resolve its status before pickup.</p>}{returning&&<p className="administration-hint">Describe any damage. Damaged returns create a report and remove the affected items from service.</p>}{organizationId==='preview'?<label><input type="checkbox" checked={previewOnCampus} onChange={e=>setPreviewOnCampus(e.target.checked)}/>Simulate being on campus (preview only)</label>:<p className="administration-hint">Your location is checked when you submit to confirm you are on campus near {agencyCampus.name}.</p>}{error&&<p role="alert">{error}</p>}{locationIssue&&<LocationHelp {...locationIssue} busy={busy} onRetry={()=>form.current?.requestSubmit()}/>}{ready&&!blocked&&unmatched.length>0&&<p className="administration-hint" id="handoff-unmatched">Match every label before you {returning?'return':'check out'} the equipment. Still to match: {unmatched.map(id=>items.find(item=>item.id===id)?.name??id).join(', ')}.</p>}<button className="ws-button-primary" disabled={busy||!ready||blocked||scan||unmatched.length>0} aria-describedby={ready&&!blocked&&unmatched.length?'handoff-unmatched':undefined}>{locating?'Confirming your location…':busy?'Saving…':returning?'Return equipment':'Check out equipment'}</button>
  </fieldset></form>
}
