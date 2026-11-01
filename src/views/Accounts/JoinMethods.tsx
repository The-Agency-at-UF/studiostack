'use client'
import {useState} from 'react'
import type {AccountClient} from '../../api/accounts'
import type {JoinCode,PendingAccessRequest,WorkspaceDomain} from '../../types/accounts'
type Run=(key:string,task:(client:AccountClient,requestId:string)=>Promise<unknown>)=>Promise<unknown>
/** Self-service ways into the workspace: pending requests, member join codes and verified email domains. */
export default function JoinMethods({owner,busy,run,requests,codes,domains}:{owner:boolean;busy:boolean;run:Run;requests:PendingAccessRequest[];codes:JoinCode[];domains:WorkspaceDomain[]}) {
  const [shown,setShown]=useState<{label:string;code:string}|null>(null)
  const active=codes.filter(c=>!c.revokedAt&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now()))
  async function createCode(form:HTMLFormElement){
    const f=new FormData(form),uses=String(f.get('uses')),days=String(f.get('days')),input={label:String(f.get('label')),maxUses:uses?Number(uses):null,expiresInDays:days?Number(days):null}
    const created=await run(JSON.stringify({code:input}),(c,requestId)=>c.createJoinCode({...input,requestId})) as JoinCode|undefined
    if(created?.code){setShown({label:created.label,code:created.code});form.reset()}
  }
  return <>
    <section><h2>Access requests{requests.length>0&&<span className="administration-count" aria-label={`${requests.length} pending`}>{requests.length}</span>}</h2>
      {!requests.length&&<p>No one is waiting to join.</p>}
      <ul className="administration-list">{requests.map(r=><li key={r.id}><div><strong>{r.displayName??r.email}</strong><span>{r.email} · requested {new Date(r.createdAt).toLocaleDateString()}</span>{r.message&&<small>“{r.message}”</small>}</div>
        <div className="administration-actions"><button disabled={busy} onClick={()=>void run(`approve:${r.id}:${r.version}`,(c,requestId)=>c.decideAccessRequest(r.id,'approve',{version:r.version,requestId}))}>Approve {r.displayName??r.email}</button><button className="administration-secondary" disabled={busy} onClick={()=>void run(`deny:${r.id}:${r.version}`,(c,requestId)=>c.decideAccessRequest(r.id,'deny',{version:r.version,requestId}))}>Deny</button></div></li>)}</ul>
      <p className="administration-hint">Approved people join as members. Promote them from Members afterward.</p>
    </section>
    <section><h2>Join codes</h2>
      <form className="administration-form" onSubmit={e=>{e.preventDefault();void createCode(e.currentTarget)}}><label>Code label<input name="label" maxLength={80} placeholder="Spring crew" required/></label><label>Maximum uses<input name="uses" type="number" min={1} max={10000} placeholder="Unlimited"/></label><label>Expires after (days)<input name="days" type="number" min={1} max={365} placeholder="Never"/></label><button disabled={busy}>Create join code</button></form>
      {shown&&<div className="administration-code" role="status"><span>{shown.label}</span><code>{shown.code}</code><button type="button" onClick={()=>void navigator.clipboard?.writeText(shown.code)}>Copy code</button><small>Copy it now. This code is not shown again.</small></div>}
      <ul className="administration-list">{active.map(c=><li key={c.id}><div><strong>{c.label}</strong><span>{c.uses}{c.maxUses?` of ${c.maxUses}`:''} used{c.expiresAt?` · Expires ${new Date(c.expiresAt).toLocaleDateString()}`:''}</span></div><button className="administration-secondary" disabled={busy} onClick={()=>void run(`revoke-code:${c.id}:${c.version}`,(cl,requestId)=>cl.revokeJoinCode(c.id,{version:c.version,requestId}))}>Revoke {c.label}</button></li>)}</ul>
      {!active.length&&<p>No active join codes.</p>}
      <p className="administration-hint">Anyone with a code and a verified email joins as a member. Share codes privately.</p>
    </section>
    {owner&&<section><h2>Workspace domains</h2>
      <form className="administration-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),input={domain:String(f.get('domain')),autoJoin:f.get('mode')==='auto'};void run(JSON.stringify({domain:input}),(c,requestId)=>c.addDomain({...input,requestId}))}}><label>Email domain<input name="domain" maxLength={253} placeholder="studio.example.edu" required/></label><label>People with this email<select name="mode"><option value="auto">Join directly</option><option value="request">Request access</option></select></label><button disabled={busy}>Add domain</button></form>
      <ul className="administration-list">{domains.map(d=><li key={d.domain}><div><strong>{d.domain}</strong><span>{d.autoJoin?'Verified accounts join directly as members':'Verified accounts request access'}</span></div><div className="administration-actions"><button className="administration-secondary" disabled={busy} onClick={()=>void run(`domain:${d.domain}:${d.version}`,(c,requestId)=>c.updateDomain(d.domain,{autoJoin:!d.autoJoin,version:d.version,requestId}))}>{d.autoJoin?'Require requests':'Allow direct join'}</button><button className="administration-secondary" disabled={busy} onClick={()=>void run(`remove-domain:${d.domain}:${d.version}`,(c,requestId)=>c.removeDomain(d.domain,{version:d.version,requestId}))}>Remove {d.domain}</button></div></li>)}</ul>
      {!domains.length&&<p>No domains yet.</p>}
      <p className="administration-hint">You can add a domain your own verified email uses, such as your school or company. Public email providers can’t be added.</p>
    </section>}
  </>
}
