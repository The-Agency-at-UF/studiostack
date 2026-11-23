'use client'
import {useState} from 'react'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import type {AccountClient} from '../../api/accounts'
import type {JoinCode,PendingAccessRequest,WorkspaceDomain} from '../../types/accounts'
import {FieldError,Select} from '../../components/workspace/WorkspaceUI'
import {firstProblem,invalidProps,isBlank,notWholeNumber,type FieldProblem,type FieldRule} from '../../components/workspace/fieldCheck'
import { Pagination } from '../../components/workspace/Pagination'
import { usePagination } from '../../components/workspace/usePagination'
import {useToast} from '../../components/workspace/Toast'
import type {OrganizationInvitation} from '../../types/accounts'
import { dateLabel } from '../../format'
/** The lists an administration action can change before the server confirms it. */
export type AdminLists={invitations:OrganizationInvitation[];requests:PendingAccessRequest[];codes:JoinCode[];domains:WorkspaceDomain[]}
/** `apply` shows the change at once; `settle` folds the server's saved record in so its new version is used next. */
export type Optimistic={apply:(lists:AdminLists)=>AdminLists;settle?:(lists:AdminLists,saved:unknown)=>AdminLists}
export type Run=(key:string,task:(client:AccountClient,requestId:string)=>Promise<unknown>,optimistic?:Optimistic)=>Promise<unknown>
/** Swaps in the saved record when the server returned one with the matching key. */
export function settled<T>(list:T[],key:keyof T,saved:unknown):T[]{const record=saved as T|null;return record&&typeof record==='object'&&record[key]!==undefined?list.map(item=>item[key]===record[key]?record:item):list}

/** A destructive change waiting for the person to confirm it. */
export type PendingConfirm={title:string;subject:string;description:string;confirmLabel:string;go:()=>void;returnFocus?:()=>HTMLElement|null}
export function ConfirmChange({pending,onDone}:{pending:PendingConfirm|null;onDone:()=>void}){return pending&&<ConfirmDialog title={pending.title} subject={pending.subject} description={pending.description} confirmLabel={pending.confirmLabel} cancelLabel="Keep it" returnFocus={pending.returnFocus} onCancel={onDone} onConfirm={()=>{onDone();pending.go()}}/>}
/** People waiting for an admin to let them in. */
const decided=(id:string):Optimistic=>({apply:l=>({...l,requests:l.requests.filter(r=>r.id!==id)})})
export function AccessRequests({busy,run,requests}:{busy:boolean;run:Run;requests:PendingAccessRequest[]}) {
  const {pageRows,pagination}=usePagination(requests)
  const [pending,setPending]=useState<PendingConfirm|null>(null)
  if(!requests.length)return <ConfirmChange pending={pending} onDone={()=>setPending(null)}/>
  return <div className="administration-group"><ConfirmChange pending={pending} onDone={()=>setPending(null)}/><h3>Access requests</h3>
    <ul className="administration-list">{pageRows.map(r=><li key={r.id}><div><strong>{r.displayName??r.email}</strong><span>{r.email}, requested {dateLabel(r.createdAt)}</span>{r.message&&<small>“{r.message}”</small>}</div>
      <div className="administration-actions"><button className="ws-button-primary" disabled={busy} onClick={()=>void run(`approve:${r.id}:${r.version}`,(c,requestId)=>c.decideAccessRequest(r.id,'approve',{version:r.version,requestId}),decided(r.id))}>Approve {r.displayName??r.email}</button><button className="administration-secondary" disabled={busy} onClick={()=>setPending({title:'Deny this access request?',subject:r.displayName??r.email,description:'They won’t join the organization. They can request access again later.',confirmLabel:'Deny request',returnFocus:()=>document.getElementById('invitations-title'),go:()=>void run(`deny:${r.id}:${r.version}`,(c,requestId)=>c.decideAccessRequest(r.id,'deny',{version:r.version,requestId}),decided(r.id))})}>Deny<span className="ws-sr-only"> {r.displayName??r.email}</span></button></div></li>)}</ul>
    <Pagination label="Access requests" pagination={pagination}/>
    <p className="administration-hint">Approved people join as members. Change their role from People afterward.</p>
  </div>
}

/** Self-service ways into the workspace: verified email domains and limited join codes. */
export default function JoinMethods({owner,busy,run,codes,domains}:{owner:boolean;busy:boolean;run:Run;codes:JoinCode[];domains:WorkspaceDomain[]}) {
  const toast=useToast()
  const [replayed,setReplayed]=useState<JoinCode|null>(null)
  const [shown,setShown]=useState<{label:string;code:string}|null>(null)
  const [adding,setAdding]=useState<'code'|'domain'|null>(null)
  const [copied,setCopied]=useState('')
  const [pending,setPending]=useState<PendingConfirm|null>(null)
  // Mistakes show under the form and are named on their field (aria-invalid / aria-describedby), not in a browser bubble.
  type Field='label'|'uses'|'days'|'domain'
  const [fieldError,setFieldError]=useState<FieldProblem<Field>|null>(null)
  const invalid=(field:Field)=>invalidProps(fieldError,field,'join')
  const open=(form:'code'|'domain'|null)=>{setFieldError(null);setAdding(form)}
  const check=(form:HTMLFormElement,rules:FieldRule<Field>[])=>{const problem=firstProblem(form,rules);setFieldError(problem);return !problem}
  // The main code is the one reusable code whose value the server keeps; it is replaced from People, never revoked here.
  const main=codes.find(c=>c.code&&!c.revokedAt)
  const active=codes.filter(c=>!c.code&&!c.revokedAt&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now()))
  const copyFailed=()=>toast.error('Copy failed. Select the code and copy it manually.',{id:'join-code-copy'})
  const copy=(code:string)=>{if(!navigator.clipboard)return copyFailed();void navigator.clipboard.writeText(code).then(()=>{setCopied(code);toast.success('Join code copied.',{id:'join-code-copy'})},copyFailed)}
  const revokeCode=(c:JoinCode)=>run(`revoke-code:${c.id}:${c.version}`,(cl,requestId)=>cl.revokeJoinCode(c.id,{version:c.version,requestId}),{
    apply:l=>({...l,codes:l.codes.map(v=>v.id===c.id?{...v,revokedAt:new Date().toISOString()}:v)}),
    settle:(l,saved)=>({...l,codes:settled(l.codes,'id',saved)})
  })
  async function replaceCode(c:JoinCode){
    if(!c.revokedAt&&(!c.expiresAt||Date.parse(c.expiresAt)>Date.now())&&await revokeCode(c)===undefined)return
    setReplayed(null)
    open('code')
  }
  async function createCode(form:HTMLFormElement){
    if(!check(form,[
      {field:'label',fails:isBlank,message:'Enter a label so you can tell this code apart.'},
      {field:'uses',fails:notWholeNumber(1,10000,{optional:true}),message:'Maximum uses must be a whole number from 1 to 10,000. Leave it blank for unlimited uses.'},
      {field:'days',fails:notWholeNumber(1,365,{optional:true}),message:'Expiry must be a whole number of days from 1 to 365. Leave it blank so the code never expires.'},
    ]))return
    const f=new FormData(form),uses=String(f.get('uses')),days=String(f.get('days')),input={label:String(f.get('label')),maxUses:uses?Number(uses):null,expiresInDays:days?Number(days):null}
    const created=await run(JSON.stringify({code:input}),(c,requestId)=>c.createJoinCode({...input,requestId})) as JoinCode|undefined
    if(!created)return
    if(created.code)setShown({label:created.label,code:created.code})
    else setReplayed(created)
    setAdding(null)
  }
  async function addDomain(form:HTMLFormElement){
    if(!check(form,[{field:'domain',fails:isBlank,message:'Enter an email domain, like studio.example.edu.'}]))return
    const f=new FormData(form),input={domain:String(f.get('domain')),autoJoin:f.get('mode')==='auto'}
    if(await run(JSON.stringify({domain:input}),(c,requestId)=>c.addDomain({...input,requestId}))!==undefined)setAdding(null)
  }
  return <>
    <ConfirmChange pending={pending} onDone={()=>setPending(null)}/>
    {owner&&<div className="administration-group"><h3>Email domains</h3>
      <p className="administration-lede">People with a verified address on these domains can find and join you. Add a domain your own verified email uses; public email providers can’t be added.</p>
      {domains.length>0&&<ul className="administration-list">{domains.map(d=><li key={d.domain}><div><strong>{d.domain}</strong><span>{d.autoJoin?'Verified accounts join directly as members':'Verified accounts request access'}</span></div><div className="administration-actions"><button className="administration-secondary" disabled={busy} onClick={()=>void run(`domain:${d.domain}:${d.version}`,(c,requestId)=>c.updateDomain(d.domain,{autoJoin:!d.autoJoin,version:d.version,requestId}),{apply:l=>({...l,domains:l.domains.map(v=>v.domain===d.domain?{...v,autoJoin:!d.autoJoin}:v)}),settle:(l,saved)=>({...l,domains:settled(l.domains,'domain',saved)})})}>{d.autoJoin?'Require requests':'Allow direct join'}</button><button className="administration-quiet administration-danger" disabled={busy} onClick={()=>setPending({title:'Remove this email domain?',subject:d.domain,description:`People with @${d.domain} addresses can no longer find or join this organization on their own. Members who already joined keep access.`,confirmLabel:'Remove domain',returnFocus:()=>document.getElementById('joining-title'),go:()=>void run(`remove-domain:${d.domain}:${d.version}`,(c,requestId)=>c.removeDomain(d.domain,{version:d.version,requestId}),{apply:l=>({...l,domains:l.domains.filter(v=>v.domain!==d.domain)})})})}>Remove {d.domain}</button></div></li>)}</ul>}
      {adding==='domain'
        ?<form className="administration-form administration-inline-form" noValidate onInput={()=>setFieldError(null)} onSubmit={e=>{e.preventDefault();void addDomain(e.currentTarget)}}><label>Email domain<input name="domain" maxLength={253} placeholder="studio.example.edu" required autoFocus {...invalid('domain')}/></label><label>People with this email<Select name="mode"><option value="auto">Join directly</option><option value="request">Request access</option></Select></label><div className="administration-actions"><button disabled={busy}>Add domain</button><button type="button" className="administration-quiet" onClick={()=>open(null)}>Cancel</button></div>{fieldError&&<FieldError id={`join-${fieldError.field}-error`}>{fieldError.message}</FieldError>}</form>
        :<div className={domains.length?'administration-add':'administration-empty'}>{!domains.length&&<span>No domains yet.</span>}<button type="button" className="administration-secondary" disabled={busy} onClick={()=>open('domain')}>Add a domain</button></div>}
    </div>}
    <div className="administration-group"><h3>Join codes</h3>
      <p className="administration-lede">Anyone with a code and a verified email joins as a member. The main code never expires and is always shown here and on People. Extra codes can have a use limit or an expiry date, and are shown once when you create them.</p>
      {replayed&&<div className="administration-code"><p role="status">The code for {replayed.label} was created earlier. Its value can only be shown once.</p><button type="button" className="administration-secondary" disabled={busy} onClick={()=>void replaceCode(codes.find(c=>c.id===replayed.id)??replayed)}>Revoke and replace {replayed.label}</button></div>}
      {shown&&<div className="administration-code" role="status"><strong>New code: {shown.label}</strong><code>{shown.code}</code><button type="button" className="administration-secondary" onClick={()=>copy(shown.code)}>{copied===shown.code?'Copied':'Copy code'}</button><small>Copy it now. This code is not shown again.</small></div>}
      {(main||active.length>0)&&<ul className="administration-list">
        {main&&<li key={main.id}><div><strong>Main code <code className="administration-code-value">{main.code}</code></strong><span>{main.uses} used. No use limit or expiry. Replace it from People.</span></div><button type="button" className="administration-secondary" onClick={()=>copy(main.code!)}>{copied===main.code?'Copied':'Copy code'}</button></li>}
        {active.map(c=><li key={c.id}><div><strong>{c.label}</strong><span>{c.uses}{c.maxUses?` of ${c.maxUses}`:''} used{c.expiresAt?`, expires ${dateLabel(c.expiresAt)}`:''}</span></div><button className="administration-quiet administration-danger" disabled={busy} onClick={()=>setPending({title:'Revoke this join code?',subject:c.label,description:`${c.uses} ${c.uses===1?'person has':'people have'} used it. It stops working now; anyone who already joined keeps access.`,confirmLabel:'Revoke join code',returnFocus:()=>document.getElementById('joining-title'),go:()=>void revokeCode(c)})}>Revoke {c.label}</button></li>)}
      </ul>}
      {adding==='code'
        ?<form className="administration-form administration-inline-form" noValidate onInput={()=>setFieldError(null)} onSubmit={e=>{e.preventDefault();void createCode(e.currentTarget)}}><label>Code label<input name="label" maxLength={80} placeholder="Spring crew" required autoFocus {...invalid('label')}/></label><label>Maximum uses<input name="uses" type="number" inputMode="numeric" min={1} max={10000} step={1} placeholder="Unlimited" {...invalid('uses')}/></label><label>Expires after (days)<input name="days" type="number" inputMode="numeric" min={1} max={365} step={1} placeholder="Never" {...invalid('days')}/></label><div className="administration-actions"><button disabled={busy}>Create join code</button><button type="button" className="administration-quiet" onClick={()=>open(null)}>Cancel</button></div>{fieldError&&<FieldError id={`join-${fieldError.field}-error`}>{fieldError.message}</FieldError>}</form>
        :<div className={main||active.length?'administration-add':'administration-empty'}>{!main&&!active.length&&<span>No active join codes.</span>}<button type="button" className="administration-secondary" disabled={busy} onClick={()=>{setShown(null);setReplayed(null);open('code')}}>New join code</button></div>}
    </div>
  </>
}
