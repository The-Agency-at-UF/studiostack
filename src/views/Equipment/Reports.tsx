'use client'
import {DetailPanel,Select} from '../../components/workspace/WorkspaceUI'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import Link from 'next/link'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import {equipmentConditions,type EquipmentRecord,type EquipmentReport,type EquipmentReservation,type EquipmentEvent,type UpdateEquipmentReport} from '../../types/equipment'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import '../Accounts/Administration.css'
import './Equipment.css'
type CachedReports = { rows: EquipmentReport[]; items: EquipmentRecord[]; bookings: EquipmentReservation[] }
const label=(status:string)=>status.replaceAll('_',' ')
export default function LiveReports({create=false}:{create?:boolean}){const c=useLiveOrganization();return c?<ReportsWorkspace key={c.organization.id} api={c.api} org={c.organization.id} admin={c.admin} create={create}/>:<main className="administration"><h1>Equipment reports</h1><p>Select an active organization in your account to report equipment issues.</p></main>}
function ReportsWorkspace({api,org,admin,create}:{api:DatabaseApi;org:string;admin:boolean;create:boolean}){
  const cacheKey = `reports:${org}`
  const cached = getCached<CachedReports>(cacheKey)
  const cachedInventory = getCached<EquipmentRecord[]>(`inventory:${org}`)
  const cachedReservations = getCached<{ bookings: EquipmentReservation[] }>(`reservations:${org}`)
  const initialItems = cached?.items ?? cachedInventory ?? []
  const initialBookings = cached?.bookings ?? cachedReservations?.bookings ?? []

  const client=useMemo(()=>api.reports(org),[api,org]),[rows,setRows]=useState<EquipmentReport[]>(cached?.rows ?? []),[items,setItems]=useState<EquipmentRecord[]>(initialItems),[bookings,setBookings]=useState<EquipmentReservation[]>(initialBookings),[selected,setSelected]=useState(''),[adding,setAdding]=useState(create),[filter,setFilter]=useState('active'),[loading,setLoading]=useState(!cached),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const load=useCallback(async()=>{
    const [rows,items,bookings]=await Promise.all([
      allPages(after=>client.list(after)),
      allPages(after=>api.inventory(org,{limit:100,after})),
      allPages(after=>api.reservations(org,{limit:100,after}))
    ])
    return {rows,items,bookings}
  },[client,api,org])
  const accept=useCallback((v:Awaited<ReturnType<typeof load>>)=>{
    setRows(v.rows);setItems(v.items);setBookings(v.bookings)
    setCached(cacheKey, { rows: v.rows, items: v.items, bookings: v.bookings })
  },[cacheKey])
  useEffect(()=>{let active=true;load().then(v=>{if(!active)return;accept(v);const q=new URLSearchParams(window.location.search),id=q.get('report')??q.get('reportID');if(id&&v.rows.some(r=>r.id===id))setSelected(id)}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,accept])
  async function refresh(){setLoading(true);setError('');try{accept(await load())}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
  async function saved(row:EquipmentReport){
    invalidateCache(`reports:${org}`)
    invalidateCache(`dashboard:${org}`)
    setRows(v=>[row,...v.filter(r=>r.id!==row.id)]);setSelected(row.id);setAdding(false);setNotice('Report saved.');try{accept(await load())}catch(e){setError(equipmentError(e))}
  }
  const current=rows.find(r=>r.id===selected),visible=rows.filter(r=>filter==='all'||(filter==='resolved'?r.status==='resolved':r.status!=='resolved')).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  return <main className="administration workspace-surface"><header><div><p className="administration-eyebrow">Equipment care</p><h1>Equipment reports</h1><p>Track damage, discuss repairs and return equipment to service.</p></div><div className="administration-actions"><button disabled={loading} onClick={()=>void refresh()}>Refresh</button><button className="ws-button-primary" onClick={()=>{setAdding(true);setSelected('');setNotice('')}}>Report an issue</button></div></header>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading equipment reports…</p>}
    <label className="equipment-filter">Show reports<Select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Active reports</option><option value="resolved">Resolved reports</option><option value="all">All reports</option></Select></label>
    <div className="equipment-layout"><section className="administration-table"><table><thead><tr><th>Issue / equipment</th><th>Severity</th><th>Status</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><button className="equipment-item-link" onClick={()=>{setSelected(r.id);setAdding(false);setNotice('')}}>{r.title}</button><small>{items.find(i=>i.id===r.equipmentId)?.name??'Equipment item'}</small></td><td>{r.severity}</td><td>{label(r.status)}</td></tr>)}</tbody></table>{!loading&&!visible.length&&<p className="equipment-empty">No matching reports.</p>}</section>
    {!loading&&(adding||current)&&<DetailPanel className="equipment-inspector equipment-report-inspector" label="Report details"><button className="equipment-item-link" onClick={()=>{setAdding(false);setSelected('')}}>Close details</button>{adding?<><h2>Report an equipment issue</h2><ReportForm api={api} org={org} items={items} bookings={bookings} onSaved={saved}/></>:current&&<ReportDetails key={current.id} api={api} org={org} admin={admin} report={current} item={items.find(i=>i.id===current.equipmentId)} onSaved={saved}/>}</DetailPanel>}
    </div>
  </main>
}
function useCommandId(){const command=useRef<{key:string;id:string}|null>(null);return (value:unknown)=>{const key=JSON.stringify(value);if(command.current?.key!==key)command.current={key,id:crypto.randomUUID()};return command.current.id}}
function ReportForm({api,org,items,bookings,onSaved}:{api:DatabaseApi;org:string;items:EquipmentRecord[];bookings:EquipmentReservation[];onSaved:(r:EquipmentReport)=>Promise<void>}){
  const [equipmentId,setEquipment]=useState(''),[reservationId,setReservation]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[severity,setSeverity]=useState<EquipmentReport['severity']>('medium'),[busy,setBusy]=useState(false),[error,setError]=useState(''),commandId=useCommandId()
  async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const input={equipmentId,...(reservationId?{reservationId}:{}),title,description,severity};await onSaved(await api.reports(org).create({...input,requestId:commandId(input)}))}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <form className="equipment-editor" onSubmit={submit}><fieldset disabled={busy}><label>Equipment<Select value={equipmentId} onChange={e=>{setEquipment(e.target.value);setReservation('')}} required><option value="">Choose equipment</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} · {i.equipmentCode}</option>)}</Select></label><label>Related reservation (optional)<Select value={reservationId} onChange={e=>setReservation(e.target.value)}><option value="">No reservation</option>{bookings.filter(r=>r.equipmentIds.includes(equipmentId)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</Select></label><label>Issue title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} required/></label><label>What happened?<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={4000} required/></label><label>Severity<Select value={severity} onChange={e=>setSeverity(e.target.value as EquipmentReport['severity'])}><option value="low">Low — minor issue</option><option value="medium">Medium — needs attention</option><option value="high">High — unsafe or unusable</option></Select></label>{severity==='high'&&<p className="administration-hint">High-severity reports place this item in maintenance until an administrator resolves the issue and restores service.</p>}{error&&<p role="alert">{error}</p>}<button disabled={busy||!equipmentId}>{busy?'Saving report…':'Submit report'}</button></fieldset></form>
}
function ReportDetails({api,org,admin,report:r,item,onSaved}:{api:DatabaseApi;org:string;admin:boolean;report:EquipmentReport;item?:EquipmentRecord;onSaved:(r:EquipmentReport)=>Promise<void>}){
  const client=useMemo(()=>api.reports(org),[api,org]),[history,setHistory]=useState<EquipmentEvent[]>([]),[historyError,setHistoryError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),commandId=useCommandId()
  useEffect(()=>{let active=true;setHistoryError('');allPages(after=>client.activity(r.id,after)).then(v=>{if(active)setHistory(v)}).catch(()=>{if(active)setHistoryError('Report activity could not be loaded.')});return()=>{active=false}},[client,r.id,r.version,reload])
  async function comment(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await client.comment(r.id,message,commandId({message,reload}));setMessage('');setReload(v=>v+1)}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <><h2>{r.title}</h2><p>{item?.name??'Equipment item'} · {r.severity} · {label(r.status)}</p><p className="equipment-report-description">{r.description}</p><p className="administration-hint">Reported {new Date(r.createdAt).toLocaleString()}{item?` · Current service status: ${item.status}`:''}</p>{r.reservationId&&<Link href={`/reservations/?reservation=${r.reservationId}`}>View related reservation</Link>}{r.resolution&&<><h3>Resolution / progress notes</h3><p className="equipment-report-description">{r.resolution}</p></>}
    {admin&&<ResolutionForm key={r.id+':'+r.version} api={api} org={org} report={r} onSaved={onSaved}/>}
    <section><h3>Discussion & history</h3>{historyError&&<p role="alert">{historyError} <button onClick={()=>setReload(v=>v+1)}>Retry activity</button></p>}<ol className="equipment-history">{[...history].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(event=><li key={event.id}><strong>{label(event.kind)}</strong><small>{event.actorName} · {new Date(event.createdAt).toLocaleString()}</small>{typeof event.details.message==='string'&&<p className="equipment-report-description">{event.details.message}</p>}{typeof event.details.status==='string'&&<p>{label(event.details.status)}</p>}{typeof event.details.resolution==='string'&&<p className="equipment-report-description">{event.details.resolution}</p>}</li>)}</ol><form className="equipment-editor" onSubmit={comment}><fieldset disabled={busy}><label>Add a comment<textarea value={message} onChange={e=>setMessage(e.target.value)} maxLength={4000} required/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy||!message.trim()}>{busy?'Saving comment…':'Post comment'}</button></fieldset></form></section>
  </>
}
function ResolutionForm({api,org,report:r,onSaved}:{api:DatabaseApi;org:string;report:EquipmentReport;onSaved:(r:EquipmentReport)=>Promise<void>}){
  const [status,setStatus]=useState(r.status),[resolution,setResolution]=useState(r.resolution),[restoreService,setRestore]=useState(false),[condition,setCondition]=useState('good'),[busy,setBusy]=useState(false),[error,setError]=useState(''),commandId=useCommandId()
  async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const input={version:r.version,status,resolution,restoreService,...(restoreService?{condition:condition as UpdateEquipmentReport['condition']}:{})};await onSaved(await api.reports(org).update(r.id,{...input,requestId:commandId(input)}))}catch(e){setError(equipmentError(e))}finally{setBusy(false)}}
  return <section><h3>Review & resolution</h3><form className="equipment-editor" onSubmit={submit}><fieldset disabled={busy}><label>Report status<Select value={status} onChange={e=>{setStatus(e.target.value as EquipmentReport['status']);setRestore(false)}}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></Select></label><label>Resolution or progress notes<textarea value={resolution} onChange={e=>setResolution(e.target.value)} maxLength={4000} required={status==='resolved'}/></label>{status==='resolved'&&<><label className="administration-checkbox"><input type="checkbox" checked={restoreService} onChange={e=>setRestore(e.target.checked)}/>Restore equipment to service</label>{restoreService&&<label>Repaired condition<Select value={condition} onChange={e=>setCondition(e.target.value)}>{equipmentConditions.filter(c=>c!=='damaged').map(c=><option key={c}>{c}</option>)}</Select></label>}<p className="administration-hint">Restoring service requires all high-severity issues to be resolved. Resolving alone leaves the current service status unchanged.</p></>}{status!=='resolved'&&r.severity==='high'&&<p className="administration-hint">An open high-severity issue keeps this equipment in maintenance.</p>}{error&&<p role="alert">{error}</p>}<button disabled={busy}>{busy?'Saving resolution…':'Save report status'}</button></fieldset></form></section>
}
