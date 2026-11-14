'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {AppAlert} from '../../types/alerts'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {Skeleton} from '../../components/workspace/WorkspaceUI'
import '../Accounts/Administration.css'
import './Equipment.css'
type CachedAlerts = { rows: AppAlert[] }
export default function LiveAlerts(){const c=useLiveOrganization();return c?<AlertsWorkspace key={c.organization.id} api={c.api} org={c.organization.id}/>:<main className="administration"><h1>Alerts</h1><p>Select an active organization in your account to view your alerts.</p></main>}
function AlertsWorkspace({api,org}:{api:DatabaseApi;org:string}){
 const router=useRouter(),client=useMemo(()=>api.alerts(org),[api,org])
 const cacheKey = `alerts:${org}`
 const cached = getCached<CachedAlerts>(cacheKey)
 const cachedDashboard = getCached<{ alerts: AppAlert[] }>(`dashboard:${org}`)

 const initialRows = cached?.rows ?? cachedDashboard?.alerts ?? []

 const [rows,setRows]=useState<AppAlert[]>(initialRows),[loading,setLoading]=useState(!cached && !cachedDashboard),[pending,setPending]=useState<ReadonlySet<string>>(()=>new Set()),[error,setError]=useState(''),[unreadOnly,setUnread]=useState(false)
 const load=useCallback(async()=>({rows:await allPages(after=>client.list(after))}),[client])
 useEffect(()=>{let active=true;load().then(v=>{if(active){setRows(v.rows);setCached(cacheKey,{rows:v.rows})}}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,cacheKey])
 async function refresh(){setLoading(true);setError('');try{const v=await load();setRows(v.rows);setCached(cacheKey,{rows:v.rows})}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
 const track=(id:string,on:boolean)=>setPending(p=>{const next=new Set(p);if(on)next.add(id);else next.delete(id);return next})
 // Optimistic: the row reads as read at once; the server row replaces it, or the previous read state returns on failure.
 async function markRead(row:AppAlert,open=false){if(pending.has(row.id))return;const previous=row.readAt;track(row.id,true);setError('');if(!previous)setRows(v=>v.map(r=>r.id===row.id?{...r,readAt:new Date().toISOString()}:r));try{const saved=await client.read(row.id);invalidateCache(`alerts:${org}`);invalidateCache(`dashboard:${org}`);setRows(v=>v.map(r=>r.id===saved.id?saved:r));if(open&&(/^\/(report-summary|reservations|check-in-out)\/\?(report|reservation)=[a-f0-9-]{36}$/.test(saved.targetPath)||/^\/production\/\?brief=[a-f0-9-]{36}$/.test(saved.targetPath)))router.push(saved.targetPath)}catch(e){setRows(v=>v.map(r=>r.id===row.id?{...r,readAt:previous}:r));setError(equipmentError(e))}finally{track(row.id,false)}}
 const visible=rows.filter(r=>!unreadOnly||!r.readAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
 return <main className="administration workspace-surface"><header><div><p className="administration-eyebrow">Your organization</p><h1>Alerts</h1><p>{rows.filter(r=>!r.readAt).length} unread · Production assignments, equipment returns, report activity and booking conflicts.</p></div><button disabled={loading||pending.size>0} onClick={()=>void refresh()}>Refresh</button></header>{error&&<p role="alert">{error}</p>}
  {org!=='preview'&&<p className="administration-hint">Want these by email? <Link href="/account/notifications/">Manage notifications</Link></p>}
  <section><label className="administration-checkbox"><input type="checkbox" checked={unreadOnly} onChange={e=>setUnread(e.target.checked)}/>Unread only</label>{loading&&!rows.length?<Skeleton label="Loading alerts…" variant="row" count={4}/>:<ul className="equipment-alert-list ws-stagger">{visible.map(row=><li key={row.id} className={row.readAt?'':'unread'}><div><h2>{row.title}</h2><p>{row.message}</p><small>{new Date(row.createdAt).toLocaleString()}{row.readAt?' · Read':' · Unread'}</small></div><div className="administration-actions"><button disabled={pending.has(row.id)} onClick={()=>void markRead(row,true)}>Open</button>{!row.readAt&&<button disabled={pending.has(row.id)} onClick={()=>void markRead(row)}>Mark read</button>}</div></li>)}</ul>}{!loading&&!error&&!visible.length&&<p className="equipment-empty">{unreadOnly?'You’re caught up.':'No alerts yet.'}</p>}</section>
 </main>
}
