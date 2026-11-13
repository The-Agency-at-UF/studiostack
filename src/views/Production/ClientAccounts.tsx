'use client'
import {useEffect,useRef,useState} from 'react'
import type {ClientAccount} from '../../types/production'
import type {ProductionClient} from '../../api/production'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import {StatusLabel} from '../../components/workspace/WorkspaceUI'
function useClientAction(onRefresh:()=>Promise<void>,failure:string){
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function run(operation:()=>Promise<unknown>,after?:()=>void){if(busy)return;setBusy(true);setError('');try{await operation();if(active.current){after?.();await onRefresh()}}catch{if(active.current)setError(failure)}finally{if(active.current)setBusy(false)}}
 return {busy,error,run}
}
export default function ClientAccounts({clients,api,canManage,canDelete,onRefresh}:{clients:ClientAccount[];api:ProductionClient;canManage:boolean;canDelete:(c:ClientAccount)=>boolean;onRefresh:()=>Promise<void>}){
 const {busy,error,run}=useClientAction(onRefresh,'Client account could not be saved. Refresh and try again.')
 const [name,setName]=useState(''),[pending,setPending]=useState<ClientAccount|null>(null)
 const listed=clients.filter(c=>!c.deletedAt).sort((a,b)=>a.name.localeCompare(b.name))
 return <section className="production-settings production-clients" aria-labelledby="client-accounts-title">
  <div className="production-section-head">
   <div><h2 id="client-accounts-title">Client accounts</h2><p>Group briefs and shoots under a shared client. Deleted accounts can be restored with their bookings and briefs.</p></div>
   {listed.length>0&&<p className="production-count">{listed.length} active</p>}
  </div>
  {error&&<p role="alert" className="production-error">{error}</p>}
  {canManage&&<form className="production-inline-form" onSubmit={e=>{e.preventDefault();void run(()=>api.createClient(name.trim()),()=>setName(''))}}><fieldset disabled={busy}><label>Client account name<input value={name} required maxLength={160} onChange={e=>setName(e.target.value)}/></label><button className="production-primary">{busy?'Saving…':'Add client account'}</button></fieldset></form>}
  {listed.length>0?<ul className="production-client-list">{listed.map(c=><li key={c.id}><span className="production-client-name">{c.name}</span><StatusLabel tone="success">Active</StatusLabel>{canDelete(c)&&<button type="button" className="production-danger" disabled={busy} aria-label={`Delete ${c.name}`} onClick={()=>setPending(c)}>Delete</button>}</li>)}</ul>
  :<div className="production-clients-empty"><p>No client accounts yet</p><span>{canManage?'Add the first client above. Briefs and shoots can then be grouped and filtered by client.':'Production Leads and administrators add client accounts. Briefs and shoots are grouped by client once they exist.'}</span></div>}
  {pending&&<ConfirmDialog title="Delete this client account?" subject={pending.name} description="It will no longer be offered for new briefs or bookings. Existing briefs and bookings keep it, and an owner, administrator or the person who added it can restore it from Access & notifications." confirmLabel="Delete client account" busy={busy} onCancel={()=>setPending(null)} onConfirm={()=>{const c=pending;void run(()=>api.updateClient(c.id,{name:c.name,deleted:true,version:c.version}),()=>setPending(null))}}/>}
 </section>
}
export function DeletedClientAccounts({clients,api,canRestore,onRefresh}:{clients:ClientAccount[];api:ProductionClient;canRestore:(c:ClientAccount)=>boolean;onRefresh:()=>Promise<void>}){
 const {busy,error,run}=useClientAction(onRefresh,'Client account could not be restored. Refresh and try again.')
 const deleted=clients.filter(c=>c.deletedAt&&canRestore(c)).sort((a,b)=>a.name.localeCompare(b.name))
 return <section className="production-settings production-clients" aria-labelledby="deleted-client-accounts-title">
  <div className="production-section-head"><div><h2 id="deleted-client-accounts-title">Deleted client accounts</h2><p>Restoring an account offers it again for new briefs and bookings. Its existing briefs and bookings never lost it.</p></div></div>
  {error&&<p role="alert" className="production-error">{error}</p>}
  {deleted.length>0?<ul className="production-client-list">{deleted.map(c=><li key={c.id} className="is-archived"><span className="production-client-name">{c.name}</span><StatusLabel>Deleted</StatusLabel><button type="button" disabled={busy} aria-label={`Restore ${c.name}`} onClick={()=>void run(()=>api.updateClient(c.id,{name:c.name,deleted:false,version:c.version}))}>Restore</button></li>)}</ul>
  :<p className="production-empty">No deleted client accounts you can restore.</p>}
 </section>
}
