'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import type {OnboardingOverview} from '../../types/accounts'
import EmailVerification from '../Production/EmailVerification'
type Joined={organizationId:string;organizationName:string;displayName:string}
/** Guides a signed-in account with no workspace into its organization, then confirms the name teammates see. */
export default function Onboarding({getAccessToken,onJoined}:{getAccessToken:()=>Promise<string>;onJoined:(organizationId:string)=>Promise<void>}) {
  const api=useMemo(()=>createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken}),[getAccessToken])
  const [overview,setOverview]=useState<OnboardingOverview|null>(null),[joined,setJoined]=useState<Joined|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[unverified,setUnverified]=useState(false),[code,setCode]=useState(''),[message,setMessage]=useState('')
  const load=useCallback(async()=>{setBusy(true);setError('');try{setOverview(await api.onboarding());setUnverified(false)}catch(e){if(e instanceof DatabaseApiClientError&&e.status===403)setUnverified(true);else setError('Workspaces could not be checked. Refresh to try again.')}finally{setBusy(false)}},[api])
  useEffect(()=>{void load()},[load])
  // Someone may approve a request or send an invitation while this tab waits in the background.
  useEffect(()=>{if(joined)return;const refresh=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[load,joined])
  async function act(task:()=>Promise<unknown>,failure:string,after?:(value:unknown)=>void){setBusy(true);setError('');try{const value=await task();after?.(value)}catch(e){setError(e instanceof DatabaseApiClientError&&e.status===429?'Too many join code attempts. Try again in an hour.':failure)}finally{setBusy(false)}}
  const name=(invited?:string)=>invited||overview?.displayName||''
  if(joined)return <section className="account-invitations onboarding" aria-labelledby="onboarding-title"><span className="onboarding-step">Step 2 of 2</span><h2 id="onboarding-title">{joined.organizationName?`You’re in ${joined.organizationName}.`:'You’ve joined the workspace.'}</h2><p>Confirm the name your teammates will see on reservations, shoots and reports.</p>
    {error&&<p role="alert">{error}</p>}
    <form onSubmit={e=>{e.preventDefault();const displayName=String(new FormData(e.currentTarget).get('displayName')).trim();void act(async()=>{await api.register(displayName);await onJoined(joined.organizationId)},'Your name could not be saved. Try again.')}}>
      <label className="login-workspace-picker">Your name<input name="displayName" defaultValue={joined.displayName} maxLength={120} autoComplete="name" required/></label>
      <button className="login-primary" disabled={busy}>{busy?'Opening your workspace…':'Continue to workspace'}</button>
    </form></section>
  const invitations=overview?.invitations??[],direct=overview?.domainMatches.filter(d=>d.autoJoin)??[],requestable=overview?.domainMatches.filter(d=>!d.autoJoin&&!overview.requests.some(r=>r.organizationId===d.organizationId&&r.status==='pending'))??[]
  const pending=overview?.requests.filter(r=>r.status==='pending')??[],denied=overview?.requests.filter(r=>r.status==='denied')??[]
  const options=invitations.length+direct.length+requestable.length
  return <section className="account-invitations onboarding" aria-labelledby="onboarding-title"><span className="onboarding-step">Step 1 of 2</span><h2 id="onboarding-title">{options?'Join your workspace':pending.length?'Waiting for approval':'You’re not in a workspace yet'}</h2>
    <EmailVerification getAccessToken={getAccessToken}/>
    {unverified&&<p>Verify your sign-in email above, then refresh to see the workspaces you can join.</p>}
    {error&&<p role="alert">{error}</p>}
    {overview&&<p>Signed in as <strong>{overview.email}</strong>.</p>}
    <ul className="onboarding-options">
      {invitations.map(i=><li key={i.id}><div><strong>{i.organizationName}</strong><small>Invited as {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</small></div><button className="login-primary" disabled={busy} onClick={()=>void act(()=>api.acceptInvitation(i.id,i.organizationId),'The invitation could not be accepted. Refresh and try again.',()=>setJoined({organizationId:i.organizationId,organizationName:i.organizationName,displayName:name(i.displayName)}))}>Accept invitation to {i.organizationName}</button></li>)}
      {direct.map(d=><li key={d.organizationId}><div><strong>{d.organizationName}</strong><small>Open to your verified email domain</small></div><button className="login-primary" disabled={busy} onClick={()=>void act(()=>api.joinByDomain(d.organizationId),'This workspace could not be joined. Refresh and try again.',()=>setJoined({organizationId:d.organizationId,organizationName:d.organizationName,displayName:name()}))}>Join {d.organizationName}</button></li>)}
      {requestable.map(d=><li key={d.organizationId}><div><strong>{d.organizationName}</strong><small>An administrator approves new members</small></div>
        <form onSubmit={e=>{e.preventDefault();void act(()=>api.requestAccess(d.organizationId,message.trim()||undefined),'Your request could not be sent. Refresh and try again.',()=>{setMessage('');void load()})}}><label className="login-workspace-picker">Note for administrators (optional)<textarea value={message} maxLength={500} rows={2} onChange={e=>setMessage(e.target.value)}/></label><button className="login-primary" disabled={busy}>Request access to {d.organizationName}</button></form></li>)}
      {pending.map(r=><li key={r.id}><div><strong>{r.organizationName}</strong><small>Request sent {new Date(r.createdAt).toLocaleDateString()} · waiting for an administrator</small></div><button disabled={busy} onClick={()=>void act(()=>api.withdrawAccessRequest(r.id,r.organizationId),'The request could not be withdrawn. Refresh and try again.',()=>void load())}>Withdraw request</button></li>)}
      {denied.map(r=><li key={r.id}><div><strong>{r.organizationName}</strong><small>An administrator declined this request. Ask them for an invitation or a join code.</small></div></li>)}
    </ul>
    <form className="onboarding-code" onSubmit={e=>{e.preventDefault();void act(()=>api.joinByCode(code),'That join code is not valid. Check it with your workspace administrator.',value=>{setCode('');setJoined({organizationId:(value as {organizationId:string}).organizationId,organizationName:'',displayName:name()})})}}>
      <label className="login-workspace-picker">Have a join code?<input value={code} onChange={e=>setCode(e.target.value)} placeholder="ABCDE-FGHJK" maxLength={32} autoComplete="off" spellCheck={false} required/></label>
      <button disabled={busy||!code.trim()}>Join with code</button>
    </form>
    {overview&&!options&&!pending.length&&<p>Ask a workspace administrator to invite <strong>{overview.email}</strong>, or to share a join code with you.</p>}
    <button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Checking…':'Refresh'}</button>
  </section>
}
