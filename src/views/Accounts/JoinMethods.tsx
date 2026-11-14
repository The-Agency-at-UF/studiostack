'use client'
import {useState} from 'react'
import type {AccountClient} from '../../api/accounts'
import type {JoinCode,PendingAccessRequest,WorkspaceDomain} from '../../types/accounts'
import {Select} from '../../components/workspace/WorkspaceUI'
import type {OrganizationInvitation} from '../../types/accounts'
/** The lists an administration action can change before the server confirms it. */
export type AdminLists={invitations:OrganizationInvitation[];requests:PendingAccessRequest[];codes:JoinCode[];domains:WorkspaceDomain[]}
/** `apply` shows the change at once; `settle` folds the server's saved record in so its new version is used next. */
export type Optimistic={apply:(lists:AdminLists)=>AdminLists;settle?:(lists:AdminLists,saved:unknown)=>AdminLists}
export type Run=(key:string,task:(client:AccountClient,requestId:string)=>Promise<unknown>,optimistic?:Optimistic)=>Promise<unknown>
/** Swaps in the saved record when the server returned one with the matching key. */
export function settled<T>(list:T[],key:keyof T,saved:unknown):T[]{const record=saved as T|null;return record&&typeof record==='object'&&record[key]!==undefined?list.map(item=>item[key]===record[key]?record:item):list}

/** People waiting for an admin to let them in. */
const decided=(id:string):Optimistic=>({apply:l=>({...l,requests:l.requests.filter(r=>r.id!==id)})})
export function AccessRequests({busy,run,requests}:{busy:boolean;run:Run;requests:PendingAccessRequest[]}) {
  if(!requests.length)return null
  return <div className="administration-group"><h3>Access requests</h3>
    <ul className="administration-list">{requests.map(r=><li key={r.id}><div><strong>{r.displayName??r.email}</strong><span>{r.email} · requested {new Date(r.createdAt).toLocaleDateString()}</span>{r.message&&<small>“{r.message}”</small>}</div>
      <div className="administration-actions"><button className="ws-button-primary" disabled={busy} onClick={()=>void run(`approve:${r.id}:${r.version}`,(c,requestId)=>c.decideAccessRequest(r.id,'approve',{version:r.version,requestId}),decided(r.id))}>Approve {r.displayName??r.email}</button><button className="administration-secondary" disabled={busy} onClick={()=>void run(`deny:${r.id}:${r.version}`,(c,requestId)=>c.decideAccessRequest(r.id,'deny',{version:r.version,requestId}),decided(r.id))}>Deny</button></div></li>)}</ul>
    <p className="administration-hint">Approved people join as members. Change their role from People afterward.</p>
  </div>
}

/** Self-service ways into the workspace: verified email domains and limited join codes. */
export default function JoinMethods({owner,busy,run,codes,domains}:{owner:boolean;busy:boolean;run:Run;codes:JoinCode[];domains:WorkspaceDomain[]}) {
  const [shown,setShown]=useState<{label:string;code:string}|null>(null)
  const [adding,setAdding]=useState<'code'|'domain'|null>(null)
  const [copied,setCopied]=useState('')
  // The main code is the one reusable code whose value the server keeps; it is replaced from People, never revoked here.
  const main=codes.find(c=>c.code&&!c.revokedAt)
  const active=codes.filter(c=>!c.code&&!c.revokedAt&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now()))
  const copy=(code:string)=>void navigator.clipboard?.writeText(code).then(()=>setCopied(code),()=>{})
  async function createCode(form:HTMLFormElement){
    const f=new FormData(form),uses=String(f.get('uses')),days=String(f.get('days')),input={label:String(f.get('label')),maxUses:uses?Number(uses):null,expiresInDays:days?Number(days):null}
    const created=await run(JSON.stringify({code:input}),(c,requestId)=>c.createJoinCode({...input,requestId})) as JoinCode|undefined
    if(created?.code){setShown({label:created.label,code:created.code});setAdding(null)}
  }
  async function addDomain(form:HTMLFormElement){
    const f=new FormData(form),input={domain:String(f.get('domain')),autoJoin:f.get('mode')==='auto'}
    if(await run(JSON.stringify({domain:input}),(c,requestId)=>c.addDomain({...input,requestId}))!==undefined)setAdding(null)
  }
  return <>
    {owner&&<div className="administration-group"><h3>Email domains</h3>
      <p className="administration-lede">People with a verified address on these domains can find and join you. Add a domain your own verified email uses; public email providers can’t be added.</p>
      {domains.length>0&&<ul className="administration-list">{domains.map(d=><li key={d.domain}><div><strong>{d.domain}</strong><span>{d.autoJoin?'Verified accounts join directly as members':'Verified accounts request access'}</span></div><div className="administration-actions"><button className="administration-secondary" disabled={busy} onClick={()=>void run(`domain:${d.domain}:${d.version}`,(c,requestId)=>c.updateDomain(d.domain,{autoJoin:!d.autoJoin,version:d.version,requestId}),{apply:l=>({...l,domains:l.domains.map(v=>v.domain===d.domain?{...v,autoJoin:!d.autoJoin}:v)}),settle:(l,saved)=>({...l,domains:settled(l.domains,'domain',saved)})})}>{d.autoJoin?'Require requests':'Allow direct join'}</button><button className="administration-quiet administration-danger" disabled={busy} onClick={()=>void run(`remove-domain:${d.domain}:${d.version}`,(c,requestId)=>c.removeDomain(d.domain,{version:d.version,requestId}),{apply:l=>({...l,domains:l.domains.filter(v=>v.domain!==d.domain)})})}>Remove {d.domain}</button></div></li>)}</ul>}
      {adding==='domain'
        ?<form className="administration-form administration-inline-form" onSubmit={e=>{e.preventDefault();void addDomain(e.currentTarget)}}><label>Email domain<input name="domain" maxLength={253} placeholder="studio.example.edu" required autoFocus/></label><label>People with this email<Select name="mode"><option value="auto">Join directly</option><option value="request">Request access</option></Select></label><div className="administration-actions"><button disabled={busy}>Add domain</button><button type="button" className="administration-quiet" onClick={()=>setAdding(null)}>Cancel</button></div></form>
        :<div className={domains.length?'administration-add':'administration-empty'}>{!domains.length&&<span>No domains yet.</span>}<button type="button" className="administration-secondary" disabled={busy} onClick={()=>setAdding('domain')}>Add a domain</button></div>}
    </div>}
    <div className="administration-group"><h3>Join codes</h3>
      <p className="administration-lede">Anyone with a code and a verified email joins as a member. The main code never expires and is always shown here and on People. Extra codes can have a use limit or an expiry date, and are shown once when you create them.</p>
      {shown&&<div className="administration-code" role="status"><strong>New code: {shown.label}</strong><code>{shown.code}</code><button type="button" className="administration-secondary" onClick={()=>copy(shown.code)}>{copied===shown.code?'Copied':'Copy code'}</button><small>Copy it now. This code is not shown again.</small></div>}
      {(main||active.length>0)&&<ul className="administration-list">
        {main&&<li key={main.id}><div><strong>Main code <code className="administration-code-value">{main.code}</code></strong><span>{main.uses} used · No use limit or expiry · Replace it from People</span></div><button type="button" className="administration-secondary" onClick={()=>copy(main.code!)}>{copied===main.code?'Copied':'Copy code'}</button></li>}
        {active.map(c=><li key={c.id}><div><strong>{c.label}</strong><span>{c.uses}{c.maxUses?` of ${c.maxUses}`:''} used{c.expiresAt?` · Expires ${new Date(c.expiresAt).toLocaleDateString()}`:''}</span></div><button className="administration-quiet administration-danger" disabled={busy} onClick={()=>void run(`revoke-code:${c.id}:${c.version}`,(cl,requestId)=>cl.revokeJoinCode(c.id,{version:c.version,requestId}),{apply:l=>({...l,codes:l.codes.map(v=>v.id===c.id?{...v,revokedAt:new Date().toISOString()}:v)}),settle:(l,saved)=>({...l,codes:settled(l.codes,'id',saved)})})}>Revoke {c.label}</button></li>)}
      </ul>}
      {adding==='code'
        ?<form className="administration-form administration-inline-form" onSubmit={e=>{e.preventDefault();void createCode(e.currentTarget)}}><label>Code label<input name="label" maxLength={80} placeholder="Spring crew" required autoFocus/></label><label>Maximum uses<input name="uses" type="number" min={1} max={10000} placeholder="Unlimited"/></label><label>Expires after (days)<input name="days" type="number" min={1} max={365} placeholder="Never"/></label><div className="administration-actions"><button disabled={busy}>Create join code</button><button type="button" className="administration-quiet" onClick={()=>setAdding(null)}>Cancel</button></div></form>
        :<div className={main||active.length?'administration-add':'administration-empty'}>{!main&&!active.length&&<span>No active join codes.</span>}<button type="button" className="administration-secondary" disabled={busy} onClick={()=>{setShown(null);setAdding('code')}}>New join code</button></div>}
    </div>
  </>
}
