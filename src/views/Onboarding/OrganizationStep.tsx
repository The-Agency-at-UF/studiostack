import {useCallback,useEffect,useRef,useState} from 'react'
import {HiOutlineMagnifyingGlass} from 'react-icons/hi2'
import {DatabaseApiClientError,type createDatabaseApiClient} from '../../api/database'
import type {JoinPolicy,OnboardingOverview,OrganizationSearchResult} from '../../types/accounts'
import WelcomeActions from './WelcomeActions'
import {useToast} from '../../components/workspace/Toast'
import { dateLabel, roleLabel } from '../../format'
type Api=ReturnType<typeof createDatabaseApiClient>
const tags:Record<JoinPolicy,string>={open:'Open',request:'Request access',pending:'Pending',invite:'Invite only',member:'Joined'}
const initials=(name:string)=>name.split(/\s+/).filter(w=>/^[\p{L}\p{N}]/u.test(w)).slice(0,2).map(w=>w[0].toUpperCase()).join('')
const failure=(e:unknown,fallback:string)=>e instanceof DatabaseApiClientError&&e.status===429?(fallback.startsWith('That join code')?'Too many join code attempts. Try again in an hour.':'Too many searches. Try again in an hour.'):fallback
/** A removed member's code is real but cannot let them back in; only an invitation can. */
const codeFailure=(e:unknown)=>e instanceof DatabaseApiClientError&&e.status===409?'You were removed from this workspace, so a join code can’t add you back. Ask an administrator to invite you.':failure(e,'That join code isn’t valid. Check it with your administrator.')
/** Finds the account's organization by search, invitation or join code, and requests access where an administrator decides. */
export default function OrganizationStep({api,onJoined,onBack,onTitle}:{api:Api;onJoined:(organizationId:string)=>Promise<void>;onBack?:()=>void;onTitle:(title:string)=>void}) {
  const [overview,setOverview]=useState<OnboardingOverview|null>(null),[query,setQuery]=useState(''),[results,setResults]=useState<OrganizationSearchResult[]|null>(null)
  const [selected,setSelected]=useState<OrganizationSearchResult|null>(null),[requesting,setRequesting]=useState(false),[message,setMessage]=useState(''),[code,setCode]=useState('')
  const [error,setError]=useState(''),[codeError,setCodeError]=useState(''),[busy,setBusy]=useState(false),toast=useToast()
  // Once the server lets the account in, a failure to open the workspace is not a failure to join.
  const enter=(id:string)=>onJoined(id).catch(()=>toast.error('You joined, but your organization couldn’t open. Refresh the page to continue.',{id:'welcome-join'}))
  const load=useCallback(()=>api.onboarding().then(o=>{setOverview(o);setError(e=>e.startsWith('Your invitations')?'':e)}).catch(()=>setError('Your invitations couldn’t be checked. Check your connection; StudioStack tries again when you return to this tab.')),[api])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{onTitle(requesting?'Request access.':'Find your organization.')},[requesting,onTitle])
  // Only the newest search may show its results: on a slow connection "ag" can answer after "agency".
  const sequence=useRef(0),[searching,setSearching]=useState(false)
  const search=useCallback((text:string)=>{const n=++sequence.current;setSearching(true);return api.searchOrganizations(text).then(r=>{if(n!==sequence.current)return;setResults(r.items);setSelected(s=>r.items.find(i=>i.organizationId===s?.organizationId)??null)}).catch(e=>{if(n===sequence.current)setError(failure(e,'Search is unavailable. Check your connection, then try again.'))}).finally(()=>{if(n===sequence.current)setSearching(false)})},[api])
  useEffect(()=>{const text=query.trim();if(text.length<2){sequence.current++;setSearching(false);setResults(null);setSelected(null);return}
    const timer=setTimeout(()=>void search(text),250);return()=>clearTimeout(timer)},[query,search])
  // An administrator may approve a request while this tab waits in the background.
  useEffect(()=>{const refresh=()=>{if(document.visibilityState!=='visible')return;void load();if(query.trim().length>=2)void search(query.trim())};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[load,search,query])
  async function act(task:()=>Promise<unknown>,fallback:string){setBusy(true);setError('');try{await task()}catch(e){setError(failure(e,fallback))}finally{setBusy(false)}}
  const pending=overview?.requests.filter(r=>r.status==='pending')??[]

  if(requesting&&selected)return <form className="login-password-form welcome-form" noValidate onSubmit={e=>{e.preventDefault();void act(async()=>{await api.requestAccess(selected.organizationId,message.trim()||undefined);setRequesting(false);setMessage('');toast.success(`Request sent to ${selected.name}. We’ll email you when it’s decided.`,{id:'welcome-request'});await load();await search(query.trim())},'Your request could not be sent. Try again.')}}>
    <p className="login-description welcome-context">An administrator at {selected.name} approves new members.</p>
    <label>Note for administrators (optional)<textarea value={message} maxLength={500} rows={3} onChange={e=>setMessage(e.target.value)} placeholder="I’m on the Thursday broadcast crew."/></label>
    {error&&<p className="login-error" role="alert">{error}</p>}
    <WelcomeActions primary={busy?'Sending…':'Send request'} busy={busy} secondary={<button type="button" className="login-text-action" onClick={()=>{setRequesting(false);setError('')}}>Back to search</button>}/>
  </form>

  const primary=!selected?'Choose an organization':selected.policy==='open'?`Join ${selected.name}`:selected.policy==='member'?`Open ${selected.name}`:selected.policy==='request'?'Request access':selected.policy==='pending'?'Check request status':'Join'
  return <div className="welcome-form">
    {overview&&overview.invitations.length>0&&<section aria-labelledby="welcome-invitations"><h2 id="welcome-invitations" className="welcome-legend">Your invitations</h2>
      <ul className="welcome-results">{overview.invitations.map(i=><li key={i.id} className="welcome-result"><span className="welcome-avatar" aria-hidden="true">{initials(i.organizationName)}</span>
        <span><strong>{i.organizationName}</strong><small>Invited as {roleLabel(i.role).toLowerCase()} · expires {dateLabel(i.expiresAt)}</small></span>
        <button type="button" className="welcome-secondary" disabled={busy} onClick={()=>void act(async()=>{await api.acceptInvitation(i.id,i.organizationId);await enter(i.organizationId)},'The invitation could not be accepted. Refresh and try again.')}>Accept<span className="login-sr-only"> invitation to {i.organizationName}</span></button></li>)}</ul></section>}
    <form id="welcome-organization" className="login-password-form welcome-form" noValidate onSubmit={e=>{e.preventDefault();setError('')
      if(!selected){setError('Choose your organization, or enter a join code.');return}
      if(selected.policy==='open')void act(async()=>{await api.joinByDomain(selected.organizationId);await enter(selected.organizationId)},'This organization could not be joined. Refresh and try again.')
      else if(selected.policy==='member')void act(()=>onJoined(selected.organizationId),'Your organization couldn’t be opened. Try again.')
      else if(selected.policy==='request')setRequesting(true)
      else if(selected.policy==='pending')void act(async()=>{await load();await search(query.trim())},'Your request could not be checked. Try again.')
      else setError(`${selected.name} is invite only. Ask its administrator for an invitation or a join code.`)}}>
      <label>Search organizations<span className="welcome-search"><HiOutlineMagnifyingGlass aria-hidden="true"/><input type="search" value={query} onChange={e=>{setQuery(e.target.value);setError('')}} placeholder="Studio, club or agency" maxLength={80} autoComplete="off" autoFocus/></span></label>
      <p className="welcome-empty" role="status">{searching?'Searching…':results?`${results.length} ${results.length===1?'organization':'organizations'} found.`:''}</p>
      {results&&(results.length?<ul className="welcome-results" aria-label="Organizations">{results.map(r=><li key={r.organizationId}>
        <button type="button" className="welcome-result" aria-pressed={selected?.organizationId===r.organizationId} onClick={()=>{setSelected(r);setError('')}}>
          <span className="welcome-avatar" aria-hidden="true">{initials(r.name)}</span><span><strong>{r.name}</strong>{r.location&&<small>{r.location}</small>}</span>
          <span className={`welcome-tag is-${r.policy}`}>{tags[r.policy]}</span></button></li>)}</ul>
        :!searching&&<p className="welcome-empty">No organization called “{query.trim()}”. Ask its administrator for an invitation or a join code.</p>)}
      {error&&<p className="login-error" role="alert">{error}</p>}
    </form>
    {pending.length>0&&<ul className="welcome-results" aria-label="Your access requests">{pending.map(r=><li key={r.id} className="welcome-result"><span className="welcome-avatar" aria-hidden="true">{initials(r.organizationName)}</span>
      <span><strong>{r.organizationName}</strong><small>Requested {dateLabel(r.createdAt)} · we’ll email you when it’s decided</small></span>
      <button type="button" className="login-text-action" disabled={busy} onClick={()=>void act(async()=>{await api.withdrawAccessRequest(r.id,r.organizationId);toast.success(`Request to ${r.organizationName} withdrawn.`,{id:'welcome-request'});await load();if(query.trim().length>=2)await search(query.trim())},'The request could not be withdrawn. Refresh and try again.')}>Withdraw<span className="login-sr-only"> request to {r.organizationName}</span></button></li>)}</ul>}
    <div className="login-divider"><span>or</span></div>
    <form className="login-password-form welcome-code-join" noValidate onSubmit={e=>{e.preventDefault();if(!code.trim()){setCodeError('Enter the join code from your administrator.');return}
      setBusy(true);setCodeError('');api.joinByCode(code).then(r=>enter(r.organizationId),e=>setCodeError(codeFailure(e))).finally(()=>setBusy(false))}}>
      <label>Join code<input value={code} onChange={e=>{setCode(e.target.value);setCodeError('')}} placeholder="ABCDE-FGHJK" maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(codeError)||undefined} aria-describedby={codeError?'welcome-join-error':undefined}/></label>
      <button className="welcome-secondary" disabled={busy}>Join with code</button>
      {codeError&&<p className="login-error" id="welcome-join-error" role="alert">{codeError}</p>}
    </form>
    <WelcomeActions form="welcome-organization" primary={busy?'Joining…':primary} busy={busy} secondary={onBack&&<button type="button" className="login-text-action" onClick={onBack}>Back</button>}/>
  </div>
}
