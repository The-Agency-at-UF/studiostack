import {useEffect,useRef,useState} from 'react'
import {HiOutlinePlus} from 'react-icons/hi2'
import type {ProductionClient} from '../../api/production'
import type {ClientAccount} from '../../types/production'
import {Select} from '../../components/workspace/WorkspaceUI'

/** Adds a shared client without leaving or saving the brief being edited. */
export default function BriefClientField({clients,value,canAdd,disabled,api,onSelect,onCreated,onCreatingChange}:{onCreatingChange:(creating:boolean)=>void;clients:ClientAccount[];value:string;canAdd:boolean;disabled:boolean;api:ProductionClient;onSelect:(client:ClientAccount|undefined)=>void;onCreated:(client:ClientAccount)=>void}) {
 const [adding,setAdding]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const active=useRef(true),pending=useRef(false),focusOnClose=useRef(false),addButton=useRef<HTMLButtonElement>(null)
 useEffect(()=>{active.current=true;return()=>{active.current=false;onCreatingChange(false)}},[onCreatingChange])
 useEffect(()=>{if(!adding&&!busy&&focusOnClose.current){focusOnClose.current=false;addButton.current?.focus()}},[adding,busy])
 function close(){focusOnClose.current=true;setAdding(false);setName('');setError('')}
 async function add(){
  if(pending.current||disabled||!canAdd)return
  const trimmed=name.trim()
  if(!trimmed){setError('Enter a client account name.');return}
  const existing=clients.find(c=>c.name.trim().toLowerCase()===trimmed.toLowerCase())
  if(existing?.deletedAt){setError('This client account was deleted. Restore it from Client accounts first.');return}
  pending.current=true;setBusy(true);onCreatingChange(true);setError('')
  try{const client=existing??await api.createClient(trimmed);if(active.current){onCreated(client);close()}}
  catch{if(active.current)setError('The client account could not be added. Your brief changes are still here. Try again.')}
  finally{pending.current=false;if(active.current){setBusy(false);onCreatingChange(false)}}
 }
 return <div className="production-brief-client">
  <div className="production-brief-client-heading"><label htmlFor="brief-client-account">Client account</label>{canAdd&&<button ref={addButton} type="button" className="production-brief-client-add" disabled={disabled||busy} aria-expanded={adding} aria-controls="brief-new-client" onClick={()=>adding?close():setAdding(true)}><HiOutlinePlus aria-hidden="true"/>Add client</button>}</div>
  <Select id="brief-client-account" value={value} disabled={disabled||busy} onChange={e=>onSelect(clients.find(c=>c.id===e.target.value))}><option value="">Choose an account or enter a client below</option>{clients.filter(c=>!c.deletedAt||c.id===value).map(c=><option key={c.id} value={c.id}>{c.name}{c.deletedAt?' · Deleted':''}</option>)}</Select>
  {adding&&<div id="brief-new-client" className="production-brief-client-editor" role="group" aria-label="New client account">
   <label>New client account name<input autoFocus value={name} disabled={disabled||busy} maxLength={160} autoComplete="organization" aria-invalid={Boolean(error)} aria-describedby={error?'brief-new-client-error':undefined} onChange={e=>{setName(e.target.value);setError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void add()}else if(e.key==='Escape'){e.preventDefault();if(!busy)close()}}}/></label>
   <div className="production-brief-client-actions"><button type="button" className="production-primary" disabled={disabled||busy} onClick={()=>void add()}>{busy?'Adding client…':'Create & select client'}</button><button type="button" disabled={busy} onClick={close}>Cancel</button></div>
   {error&&<p id="brief-new-client-error" role="alert">{error}</p>}
  </div>}
 </div>
}
