'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {useRouter} from 'next/navigation'
import {allPages,equipmentError,useLiveOrganization,type DatabaseApi} from './live'
import type {AppAlert,AlertPreferences} from '../../types/alerts'
import {getCached,setCached,invalidateCache} from '../../api/cache'
import {Skeleton} from '../../components/workspace/WorkspaceUI'
import '../Accounts/Administration.css'
import './Equipment.css'
type CachedAlerts = { rows: AppAlert[]; preferences?: AlertPreferences }
export default function LiveAlerts(){const c=useLiveOrganization();return c?<AlertsWorkspace key={c.organization.id} api={c.api} org={c.organization.id}/>:<main className="administration"><h1>Alerts</h1><p>Select an active organization in your account to view your alerts.</p></main>}
function AlertsWorkspace({api,org}:{api:DatabaseApi;org:string}){
 const router=useRouter(),client=useMemo(()=>api.alerts(org),[api,org])
 const cacheKey = `alerts:${org}`
 const cached = getCached<CachedAlerts>(cacheKey)
 const cachedDashboard = getCached<{ alerts: AppAlert[] }>(`dashboard:${org}`)

 const initialRows = cached?.rows ?? cachedDashboard?.alerts ?? []
 const initialPrefs = cached?.preferences ?? { equipmentEmail: false, version: 0 }

 const [rows,setRows]=useState<AppAlert[]>(initialRows),[preferences,setPreferences]=useState<AlertPreferences>(initialPrefs),[loading,setLoading]=useState(!cached && !cachedDashboard),[pending,setPending]=useState<ReadonlySet<string>>(()=>new Set()),[savingEmail,setSavingEmail]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[unreadOnly,setUnread]=useState(false)
 const load=useCallback(async()=>{const [rows,preferences]=await Promise.all([allPages(after=>client.list(after)),client.preferences()]);return {rows,preferences}},[client])
 useEffect(()=>{let active=true;load().then(v=>{if(active){setRows(v.rows);setPreferences(v.preferences);setCached(cacheKey,{rows:v.rows,preferences:v.preferences})}}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[load,cacheKey])
 async function refresh(){setLoading(true);setError('');try{const v=await load();setRows(v.rows);setPreferences(v.preferences);setCached(cacheKey,{rows:v.rows,preferences:v.preferences})}catch(e){setError(equipmentError(e))}finally{setLoading(false)}}
 const track=(id:string,on:boolean)=>setPending(p=>{const next=new Set(p);if(on)next.add(id);else next.delete(id);return next})
 // Optimistic: the row reads as read at once; the server row replaces it, or the previous read state returns on failure.
 async function markRead(row:AppAlert,open=false){if(pending.has(row.id))return;const previous=row.readAt;track(row.id,true);setError('');if(!previous)setRows(v=>v.map(r=>r.id===row.id?{...r,readAt:new Date().toISOString()}:r));try{const saved=await client.read(row.id);invalidateCache(`alerts:${org}`);invalidateCache(`dashboard:${org}`);setRows(v=>v.map(r=>r.id===saved.id?saved:r));if(open&&(/^\/(report-summary|reservations|check-in-out)\/\?(report|reservation)=[a-f0-9-]{36}$/.test(saved.targetPath)||/^\/production\/\?brief=[a-f0-9-]{36}$/.test(saved.targetPath)))router.push(saved.targetPath)}catch(e){setRows(v=>v.map(r=>r.id===row.id?{...r,readAt:previous}:r));setError(equipmentError(e))}finally{track(row.id,false)}}
 // Optimistic: the checkbox flips at once and returns to the saved preference if the update fails.
 async function changeEmail(equipmentEmail:boolean){if(savingEmail)return;const previous=preferences;setSavingEmail(true);setError('');setNotice('');setPreferences({...previous,equipmentEmail});try{const saved=await client.updatePreferences({...previous,equipmentEmail});invalidateCache(`alerts:${org}`);setPreferences(saved);setNotice(equipmentEmail?'Equipment email enabled.':'Equipment email disabled.')}catch(e){setPreferences(previous);setError(equipmentError(e))}finally{setSavingEmail(false)}}
 const visible=rows.filter(r=>!unreadOnly||!r.readAt).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
 return <main className="administration workspace-surface"><header><div><p className="administration-eyebrow">Your organization</p><h1>Alerts</h1><p>{rows.filter(r=>!r.readAt).length} unread · Production assignments, equipment returns, report activity and booking conflicts.</p></div><button disabled={loading||savingEmail||pending.size>0} onClick={()=>void refresh()}>Refresh</button></header>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<Skeleton label="Loading alerts…" variant="row" count={4}/>}
  {org!=='preview'&&<section><h2>Email preferences</h2><label className="administration-checkbox"><input type="checkbox" checked={preferences.equipmentEmail} disabled={loading||savingEmail} onChange={e=>void changeEmail(e.target.checked)}/>Email me about equipment alerts</label><p className="administration-hint">Alerts always appear here. Optional emails use your verified sign-up email. Production decision emails follow the organization’s Executive Leadership Team settings.</p></section>}
  <section><label className="administration-checkbox"><input type="checkbox" checked={unreadOnly} onChange={e=>setUnread(e.target.checked)}/>Unread only</label><ul className="equipment-alert-list ws-stagger">{visible.map(row=><li key={row.id} className={row.readAt?'':'unread'}><div><h2>{row.title}</h2><p>{row.message}</p><small>{new Date(row.createdAt).toLocaleString()}{row.readAt?' · Read':' · Unread'}</small></div><div className="administration-actions"><button disabled={pending.has(row.id)} onClick={()=>void markRead(row,true)}>Open</button>{!row.readAt&&<button disabled={pending.has(row.id)} onClick={()=>void markRead(row)}>Mark read</button>}</div></li>)}</ul>{!loading&&!error&&!visible.length&&<p className="equipment-empty">{unreadOnly?'You’re caught up.':'No alerts yet.'}</p>}</section>
 </main>
}
