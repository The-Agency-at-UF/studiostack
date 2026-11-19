'use client'
import {useEffect,useRef,useState} from 'react'
import type {DatabaseApi} from '../Equipment/live'
import {uploadOrganizationPhoto} from '../../api/privatePhotos'
import type {ClientAccount} from '../../types/production'
import type {ProductionClient} from '../../api/production'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import {StatusLabel} from '../../components/workspace/WorkspaceUI'
import {useToast} from '../../components/workspace/Toast'
const temporary=(c:ClientAccount)=>c.id.startsWith('pending:')
/**
 * Applies a client account change to the list at once, then confirms it with the server.
 * A rejected change puts the list back; the workspace reloads in the background either way.
 */
function useClientAction(clients:ClientAccount[],onRefresh:()=>Promise<void>,failure:string){
 const active=useRef(true);useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[override,setOverride]=useState<ClientAccount[]|null>(null)
 const busyRef=useRef(false),toast=useToast()
 // Fresh accounts from the workspace replace the local copy, unless a change is still on its way.
 useEffect(()=>{if(!busyRef.current)setOverride(null)},[clients])
 const shown=override??clients
 async function run(operation:()=>Promise<unknown>,apply:(list:ClientAccount[])=>ClientAccount[],done:string,replaces?:string){
  if(busy)return false
  const before=override
  busyRef.current=true;setBusy(true);setError('');setOverride(apply(shown))
  try{
   const saved=await operation()
   if(active.current&&saved&&typeof saved==='object'&&'id' in saved){const account=saved as ClientAccount,id=replaces??account.id;setOverride(list=>(list??clients).map(c=>c.id===id?account:c))}
   if(active.current)toast.success(done,{id:'client-accounts'})
   void onRefresh().catch(()=>toast.error('Client accounts could not reload. Refresh the page to see the latest list.',{id:'client-accounts-reload'}))
   return true
  }catch{if(active.current){setOverride(before);setError(failure)}return false}
  finally{busyRef.current=false;if(active.current)setBusy(false)}
 }
 return {busy,error,run,shown}
}
export default function ClientAccounts({clients,api,canManage,canDelete,onRefresh,database,organizationId}:{database?:DatabaseApi|null;organizationId?:string;clients:ClientAccount[];api:ProductionClient;canManage:boolean;canDelete:(c:ClientAccount)=>boolean;onRefresh:()=>Promise<void>}){
 const {busy,error,run,shown}=useClientAction(clients,onRefresh,'Client account could not be saved. Refresh and try again.')
 const [adding,setAdding]=useState(false),[name,setName]=useState(''),[pending,setPending]=useState<ClientAccount|null>(null)
 async function add(){const value=name.trim(),id=`pending:${crypto.randomUUID()}`;setName('');if(!await run(()=>api.createClient(value),list=>[...list,{id,name:value,version:0,createdBy:null,deletedAt:null}],`${value} added.`,id))setName(n=>n||value)}
 function remove(c:ClientAccount){setPending(null);void run(()=>api.updateClient(c.id,{name:c.name,deleted:true,version:c.version}),list=>list.map(v=>v.id===c.id?{...v,deletedAt:new Date().toISOString()}:v),`${c.name} deleted.`)}
 const listed=shown.filter(c=>!c.deletedAt).sort((a,b)=>a.name.localeCompare(b.name))
 return <section className="production-settings production-clients" aria-labelledby="client-accounts-title">
  <div className="production-section-head">
   <div><h2 id="client-accounts-title">Client accounts</h2><p>Group briefs and shoots under a shared client. Deleted accounts can be restored with their bookings and briefs.</p></div>
   {canManage&&<button className="production-primary" onClick={()=>setAdding(v=>!v)}>+ Add client account</button>}
   {listed.length>0&&<p className="production-count">{listed.length} active</p>}
  </div>
  {error&&<p role="alert" className="production-error">{error}</p>}
  {canManage&&adding&&<form className="production-inline-form" onSubmit={e=>{e.preventDefault();void add()}}><fieldset disabled={busy}><label>Client account name<input value={name} required maxLength={160} onChange={e=>setName(e.target.value)}/></label><button className="production-primary">{busy?'Saving…':'Add client account'}</button></fieldset></form>}
  {listed.length>0?<ul className="production-client-list">{listed.map(c=><li key={c.id} className={temporary(c)?'is-saving':undefined} aria-busy={temporary(c)||undefined}><span className="production-client-name">{c.logoPhotoId&&<ClientLogo key={`${c.id}:${c.logoPhotoId}`} client={c} api={api}/>} {c.name}</span>{temporary(c)?<StatusLabel>Saving…</StatusLabel>:<StatusLabel tone="success">Active</StatusLabel>}{!temporary(c)&&canManage&&database&&organizationId&&<label className="production-logo-upload">Upload logo for {c.name}<input type="file" disabled={busy} accept="image/*,.heic,.heif,.avif" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{const photo=await uploadOrganizationPhoto(file,organizationId,database);return api.updateClient(c.id,{name:c.name,deleted:false,version:c.version,logoPhotoId:photo.photoId})},list=>list,`${c.name} logo updated.`)}}/></label>}{!temporary(c)&&canManage&&c.logoPhotoId&&<button disabled={busy} onClick={()=>void run(()=>api.updateClient(c.id,{name:c.name,deleted:false,version:c.version,logoPhotoId:null}),list=>list.map(v=>v.id===c.id?{...v,logoPhotoId:null}:v),`${c.name} logo removed.`)}>Remove logo</button>}{!temporary(c)&&canDelete(c)&&<button type="button" className="production-danger" disabled={busy} aria-label={`Delete ${c.name}`} onClick={()=>setPending(c)}>Delete</button>}</li>)}</ul>
  :<div className="production-clients-empty"><p>No client accounts yet</p><span>{canManage?'Add the first client above. Briefs and shoots can then be grouped and filtered by client.':'Production Leads and administrators add client accounts. Briefs and shoots are grouped by client once they exist.'}</span></div>}
  {pending&&<ConfirmDialog title="Delete this client account?" subject={pending.name} description="It will no longer be offered for new briefs or bookings. Existing briefs and bookings keep it, and an owner, administrator or the person who added it can restore it under Deleted client accounts below." confirmLabel="Delete client account" busy={busy} onCancel={()=>setPending(null)} onConfirm={()=>remove(pending)}/>}
 </section>
}
export function DeletedClientAccounts({clients,api,canRestore,onRefresh}:{clients:ClientAccount[];api:ProductionClient;canRestore:(c:ClientAccount)=>boolean;onRefresh:()=>Promise<void>}){
 const {busy,error,run,shown}=useClientAction(clients,onRefresh,'Client account could not be restored. Refresh and try again.')
 const deleted=shown.filter(c=>c.deletedAt&&canRestore(c)).sort((a,b)=>a.name.localeCompare(b.name))
 return <section className="production-settings production-clients" aria-labelledby="deleted-client-accounts-title">
  <div className="production-section-head"><div><h2 id="deleted-client-accounts-title">Deleted client accounts</h2><p>Restoring an account offers it again for new briefs and bookings. Its existing briefs and bookings never lost it.</p></div></div>
  {error&&<p role="alert" className="production-error">{error}</p>}
  {deleted.length>0?<ul className="production-client-list">{deleted.map(c=><li key={c.id} className="is-archived"><span className="production-client-name">{c.name}</span><StatusLabel>Deleted</StatusLabel><button type="button" disabled={busy} aria-label={`Restore ${c.name}`} onClick={()=>void run(()=>api.updateClient(c.id,{name:c.name,deleted:false,version:c.version}),list=>list.map(v=>v.id===c.id?{...v,deletedAt:null}:v),`${c.name} restored.`)}>Restore</button></li>)}</ul>
  :<p className="production-empty">No deleted client accounts you can restore.</p>}
 </section>
}

function ClientLogo({client,api}:{client:ClientAccount;api:ProductionClient}){
 const [url,setUrl]=useState(''),[error,setError]=useState(false)
 useEffect(()=>{let active=true,timer:ReturnType<typeof setTimeout>;const load=()=>api.clientLogo(client.id).then(result=>{if(active){setUrl(result.url);timer=setTimeout(()=>void load(),Math.max(10000,(result.expiresIn-10)*1000))}}).catch(()=>{if(active)setError(true)});void load();return()=>{active=false;clearTimeout(timer)}},[api,client.id])
 return error?<span>Logo unavailable</span>:url?<img className="production-client-logo" src={url} alt={`${client.name} logo`} referrerPolicy="no-referrer"/>:null
}
