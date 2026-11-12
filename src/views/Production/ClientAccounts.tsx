'use client'
import {useEffect,useRef,useState} from 'react'
import type {ClientAccount} from '../../types/production'
import type {ProductionClient} from '../../api/production'
import {StatusLabel} from '../../components/workspace/WorkspaceUI'
export default function ClientAccounts({clients,api,canManage,onRefresh}:{clients:ClientAccount[];api:ProductionClient;canManage:boolean;onRefresh:()=>Promise<void>}){
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function run(operation:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await operation();if(active.current){setName('');await onRefresh()}}catch{if(active.current)setError('Client account could not be saved. Refresh and try again.')}finally{if(active.current)setBusy(false)}}
 const sorted=[...clients].sort((a,b)=>Number(!!a.archivedAt)-Number(!!b.archivedAt)||a.name.localeCompare(b.name))
 const archived=clients.filter(c=>c.archivedAt).length
 return <section className="production-settings production-clients" aria-labelledby="client-accounts-title">
  <div className="production-section-head">
   <div><h2 id="client-accounts-title">Client accounts</h2><p>Group briefs and shoots under a shared client. Archived accounts keep their production history.</p></div>
   {clients.length>0&&<p className="production-count">{clients.length-archived} active{archived?` · ${archived} archived`:''}</p>}
  </div>
  {error&&<p role="alert" className="production-error">{error}</p>}
  {canManage&&<form className="production-inline-form" onSubmit={e=>{e.preventDefault();void run(()=>api.createClient(name.trim()))}}><fieldset disabled={busy}><label>Client account name<input value={name} required maxLength={160} onChange={e=>setName(e.target.value)}/></label><button className="production-primary">{busy?'Saving…':'Add client account'}</button></fieldset></form>}
  {clients.length>0?<ul className="production-client-list">{sorted.map(c=><li key={c.id} className={c.archivedAt?'is-archived':undefined}><span className="production-client-name">{c.name}</span>{c.archivedAt?<StatusLabel>Archived</StatusLabel>:<StatusLabel tone="success">Active</StatusLabel>}{canManage&&<button type="button" disabled={busy} aria-label={`${c.archivedAt?'Restore':'Archive'} ${c.name}`} onClick={()=>void run(()=>api.updateClient(c.id,{name:c.name,archived:!c.archivedAt,version:c.version}))}>{c.archivedAt?'Restore':'Archive'}</button>}</li>)}</ul>
  :<div className="production-clients-empty"><p>No client accounts yet</p><span>{canManage?'Add the first client above. Briefs and shoots can then be grouped and filtered by client.':'Production Leads and administrators add client accounts. Briefs and shoots are grouped by client once they exist.'}</span></div>}
 </section>
}
