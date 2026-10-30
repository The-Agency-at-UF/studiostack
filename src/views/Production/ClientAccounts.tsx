'use client'
import {useEffect,useRef,useState} from 'react'
import type {ClientAccount} from '../../types/production'
import type {ProductionClient} from '../../api/production'
export default function ClientAccounts({clients,api,canManage,onRefresh}:{clients:ClientAccount[];api:ProductionClient;canManage:boolean;onRefresh:()=>Promise<void>}){
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 async function run(operation:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await operation();if(active.current){setName('');await onRefresh()}}catch{if(active.current)setError('Client account could not be saved. Refresh and try again.')}finally{if(active.current)setBusy(false)}}
 return <section className="production-settings"><h2>Client accounts</h2><p>Use a shared client account to group briefs and shoots. Archived accounts keep their production history.</p>{error&&<p role="alert">{error}</p>}{canManage&&<form onSubmit={e=>{e.preventDefault();void run(()=>api.createClient(name))}}><fieldset disabled={busy}><label>Client account name<input value={name} required maxLength={160} onChange={e=>setName(e.target.value)}/></label><button className="production-primary">Add client account</button></fieldset></form>}<ul>{clients.map(c=><li key={c.id}>{c.name}{c.archivedAt?' · Archived':''} {canManage&&<button disabled={busy} onClick={()=>void run(()=>api.updateClient(c.id,{name:c.name,archived:!c.archivedAt,version:c.version}))}>{c.archivedAt?'Restore':'Archive'}</button>}</li>)}</ul>{!clients.length&&<p>No client accounts yet.</p>}</section>
}
