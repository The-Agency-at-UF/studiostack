'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {useRouter} from 'next/navigation'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {AppAlert} from '../../types/alerts'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {Skeleton,LoadError,Notice,Button} from '../../components/workspace/WorkspaceUI'
import { Pagination } from '../../components/workspace/Pagination'
import { usePagination } from '../../components/workspace/usePagination'
import {useToast} from '../../components/workspace/Toast'
import { dateTimeLabel } from '../../format'
type CachedAlerts = { rows: AppAlert[] }
export default function LiveAlerts(){const c=useLiveOrganization();return c?<AlertsWorkspace key={c.organization.id} api={c.api} org={c.organization.id}/>:<main className="administration"><h1>Alerts</h1><p>Select an active organization in your account to view your alerts.</p></main>}
function AlertsWorkspace({api,org}:{api:DatabaseApi;org:string}){
  const toast=useToast()
 const router=useRouter(),client=useMemo(()=>api.alerts(org),[api,org])
 const cacheKey = `alerts:${org}`
 const cached = getCached<CachedAlerts>(cacheKey)
 const cachedDashboard = getCached<{ alerts: AppAlert[] }>(`dashboard:${org}`)

 const initialRows = cached?.rows ?? cachedDashboard?.alerts ?? []

 const [rows,setRows]=useState<AppAlert[]>(initialRows),[loading,setLoading]=useState(!cached && !cachedDashboard),[pending,setPending]=useState<ReadonlySet<string>>(()=>new Set()),[error,setError]=useState(''),[unreadOnly,setUnread]=useState(false)
 const load=useCallback(async()=>({rows:await allPages(after=>client.list(after))}),[client])
 useEffect(()=>{let active=true;load().then(v=>{if(active){setRows(v.rows);setCached(cacheKey,{rows:v.rows})}}).catch(e=>{if(active)setError(equipmentError(e,'load'))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,cacheKey])
 async function refresh(){setLoading(true);setError('');try{const v=await load();setRows(v.rows);setCached(cacheKey,{rows:v.rows})}catch(e){setError(equipmentError(e,'load'))}finally{setLoading(false)}}
 /** Alerts whose target page StudioStack can open; the rest can only be marked read. */
 const openable=(path:string)=>/^\/(report-summary|reservations|check-in-out)\/\?(report|reservation)=[a-f0-9-]{36}$/.test(path)||/^\/production\/\?brief=[a-f0-9-]{36}$/.test(path)
 const unknownCount=Boolean(error)&&!rows.length
 const track=(id:string,on:boolean)=>setPending(p=>{const next=new Set(p);if(on)next.add(id);else next.delete(id);return next})
 // Optimistic: the row reads as read at once; the server row replaces it, or the previous read state returns on failure.
 async function markRead(row:AppAlert,open=false){if(pending.has(row.id))return;const previous=row.readAt;track(row.id,true);setError('');if(!previous)setRows(v=>v.map(r=>r.id===row.id?{...r,readAt:new Date().toISOString()}:r));try{const saved=await client.read(row.id);invalidateCache(`alerts:${org}`);invalidateCache(`dashboard:${org}`);setRows(v=>v.map(r=>r.id===saved.id?saved:r));if(open&&openable(saved.targetPath))router.push(saved.targetPath)}catch(e){setRows(v=>v.map(r=>r.id===row.id?{...r,readAt:previous}:r));toast.error(`The alert was not marked as read. ${equipmentError(e)}`,{id:'alerts'})}finally{track(row.id,false)}}
 const visible=rows.filter(r=>!unreadOnly||!r.readAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
 const {pageRows,pagination}=usePagination(visible,[org,unreadOnly])
 return <main className="administration workspace-surface"><header><div><h1>Alerts</h1></div><button disabled={loading||pending.size>0} onClick={()=>void refresh()}>{loading?'Refreshing…':'Refresh'}</button></header>{error&&(unknownCount?<LoadError what="Alerts" message={error} onRetry={()=>void refresh()} retrying={loading}/>:<Notice kind="warning" action={<Button disabled={loading} onClick={()=>void refresh()}>Retry</Button>}>Showing alerts saved on this device. {error}</Notice>)}
  <section aria-labelledby="alerts-list-title"><h2 id="alerts-list-title" className="ws-sr-only">Your alerts</h2><label className="administration-checkbox"><input type="checkbox" checked={unreadOnly} onChange={e=>setUnread(e.target.checked)}/>Unread only</label>{loading&&!rows.length?<Skeleton label="Loading alerts…" variant="row" count={4}/>:<ul className="equipment-alert-list ws-stagger">{pageRows.map(row=><li key={row.id} className={row.readAt?'':'unread'}><div><h3>{row.title}</h3><p>{row.message}</p><small>{dateTimeLabel(row.createdAt)}{row.readAt?' · Read':' · Unread'}</small></div><div className="administration-actions">{openable(row.targetPath)&&<button disabled={pending.has(row.id)} onClick={()=>void markRead(row,true)}>View details<span className="ws-sr-only">: {row.title}</span></button>}{!row.readAt&&<button disabled={pending.has(row.id)} onClick={()=>void markRead(row)}>Mark read<span className="ws-sr-only">: {row.title}</span></button>}</div></li>)}</ul>}{!loading&&!error&&!visible.length&&<p className="equipment-empty">{unreadOnly&&rows.length?<>You’re caught up. <button type="button" className="ws-button ws-button-link" onClick={()=>setUnread(false)}>Show all alerts</button></>:'No alerts yet. Production assignments, returns and report activity will appear here.'}</p>}<Pagination label="Alerts" pagination={pagination}/></section>
 </main>
}
