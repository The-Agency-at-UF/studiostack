'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {createPreviewDatabaseApi} from '../../preview/database'
import {authConfiguration} from '../../auth/cognito'
import {useAppSession} from '../../context/AppSessionContext'
import type {PendingInvitation} from '../../types/accounts'
import type {ApiOrganization} from '../../types/database-api'
import EmailVerification from '../Production/EmailVerification'
import NotificationsTab from './Notifications'
import {useToast} from '../../components/workspace/Toast'
import { dateLabel, roleLabel as formatRole } from '../../format'
import { tabKeys } from '../../components/workspace/tabs'

type AccountTab='profile'|'workspaces'|'notifications'|'security'
const tabs:{value:AccountTab;label:string}[]=[{value:'profile',label:'Profile'},{value:'workspaces',label:'Organizations'},{value:'notifications',label:'Notifications'},{value:'security',label:'Sign-in and security'}]
const roleLabel=(role:ApiOrganization['role'])=>role[0].toUpperCase()+role.slice(1)
const initials=(email:string)=>(email.split('@')[0].match(/[a-z]+/gi)??['?']).slice(0,2).map(part=>part[0].toUpperCase()).join('')
const minorWords=new Set(['the','a','an','of','at','and','for'])

/** The organization's logo when it has one, otherwise a monogram from the first significant word of its name. */
export function OrganizationLogo({organization}:{organization:Pick<ApiOrganization,'name'|'logoUrl'>}) {
  const [failed,setFailed]=useState(false)
  useEffect(()=>setFailed(false),[organization.logoUrl])
  if(organization.logoUrl&&!failed)return <img className="account-org-logo" src={organization.logoUrl} alt="" onError={()=>setFailed(true)}/>
  const word=organization.name.split(/\s+/).find(w=>w&&!minorWords.has(w.toLowerCase()))??organization.name
  return <span className="account-org-logo account-org-monogram" aria-hidden="true">{word.charAt(0).toUpperCase()||'?'}</span>
}

/** The signed-in person's account: profile, workspace memberships and joining, and sign-in. */
export default function Account({initialTab='workspaces'}:{initialTab?:AccountTab}) {
  const session=useAppSession(),[tab,setTabState]=useState<AccountTab>(initialTab)
  // The open tab is kept in ?tab=, so refresh and Back return to it.
  useEffect(()=>{
    const readTab=()=>{const value=new URLSearchParams(window.location.search).get('tab');setTabState(tabs.find(item=>item.value===value)?.value??initialTab)}
    readTab()
    window.addEventListener('popstate',readTab)
    return ()=>window.removeEventListener('popstate',readTab)
  },[initialTab])
  const setTab=(next:AccountTab)=>{
    if(next===tab)return
    setTabState(next)
    const url=new URL(window.location.href)
    url.searchParams.set('tab',next)
    window.history.pushState(window.history.state,'',url)
  }
  const organizations=session.organizations??[]
  const current=organizations.find(o=>o.id===session.selectedOrganizationId)??organizations[0]
  const api=useMemo(()=>session.getAccessToken?createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}):null,[session.getAccessToken])
  const [name,setName]=useState<string|null>(null)
  useEffect(()=>{if(!api)return;let active=true
    // Registration stores the sign-in label, which is often the email; treat that as no name yet.
    api.me().then(user=>{if(active)setName(user.displayName&&user.displayName!==user.email?user.displayName:'')}).catch(()=>{if(active)setName('')})
    return()=>{active=false}},[api])
  return <main className="account-page">
    <header className="account-header">
      <span className="account-avatar" aria-hidden="true">{initials(session.email||'?')}</span>
      <div><h1>{name||session.email||'Your account'}</h1>
        {current&&<p className="account-subtitle">{roleLabel(current.role)} of {current.name}</p>}</div>
    </header>
    <div className="account-layout">
      <nav className="account-sections" aria-label="Account sections">
        <div className="account-tablist" role="tablist" aria-label="Account sections" aria-orientation="vertical" onKeyDown={tabKeys}>{tabs.map(item=><button key={item.value} type="button" role="tab" id={`account-tab-${item.value}`} aria-controls="account-panel" aria-selected={tab===item.value} tabIndex={tab===item.value?0:-1} onClick={()=>setTab(item.value)}>{item.label}</button>)}</div>
        <hr/>
        <button type="button" className="account-signout-link" onClick={()=>void session.signOut?.()}>Sign out</button>
      </nav>
      <div className="account-content" id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`}>
        {tab==='profile'&&<ProfileTab name={name} onSave={api?async value=>{const user=await api.register(value);setName(user.displayName??value)}:undefined}/>}
        {tab==='workspaces'&&<WorkspacesTab/>}
        {tab==='notifications'&&<NotificationsTab/>}
        {tab==='security'&&<SecurityTab/>}
      </div>
    </div>
  </main>
}

function ProfileTab({name,onSave}:{name:string|null;onSave?:(name:string)=>Promise<void>}) {
  const session=useAppSession()
  return <section className="account-card" aria-labelledby="account-profile-title">
    <div className="account-card-heading"><h2 id="account-profile-title">Profile</h2></div>
    <div className="account-card-body">
      {onSave&&name!==null&&<NameField initialName={name} onSave={onSave}/>}
      <label className="ws-field">Email<input type="email" value={session.email} readOnly/></label>
      {session.getAccessToken&&<EmailVerification getAccessToken={session.getAccessToken}/>}
    </div>
  </section>
}

/** The name teammates see on reservations, shoots and reports. */
function NameField({initialName,onSave}:{initialName:string;onSave:(name:string)=>Promise<void>}) {
  const [value,setValue]=useState(initialName),[busy,setBusy]=useState(false),[error,setError]=useState(''),toast=useToast()
  const changed=value.trim()!==initialName
  async function save(){
    const trimmed=value.trim()
    if(!trimmed){setError('Enter the name your team knows you by.');return}
    setBusy(true);setError('')
    try{await onSave(trimmed);toast.success('Name saved.',{id:'account-name'})}catch{setError('Your name could not be saved. Try again.')}finally{setBusy(false)}
  }
  return <form className="account-code" noValidate onSubmit={e=>{e.preventDefault();void save()}}>
    <label className="ws-field">Name<input value={value} onChange={e=>{setValue(e.target.value);setError('')}} maxLength={120} autoComplete="name" disabled={busy} aria-invalid={error?true:undefined} aria-describedby={error?'account-name-error':undefined}/></label>
    <button type="submit" className="ws-button ws-button-primary" disabled={busy||!changed}>{busy?'Saving…':'Save name'}</button>
    {error&&<p id="account-name-error" className="account-field-error" role="alert">{error}</p>}
  </form>
}

function SecurityTab() {
  const session=useAppSession()
  return <section className="account-card" aria-labelledby="account-security-title">
    <div className="account-card-heading"><h2 id="account-security-title">Sign-in and security</h2></div>
    <div className="account-row"><div><strong>Signed in as</strong><span>{session.email}</span></div>{session.mode==='authenticated'&&<span className="ws-status ws-status-success">Connected securely</span>}</div>
    <div className="account-row"><div><strong>This browser</strong><span>Sign out when you finish on a shared computer.</span></div><button type="button" className="ws-button ws-button-secondary" onClick={()=>void session.signOut?.()}>Sign out</button></div>
    {(session.mode==='preview'||session.mode==='authenticated'&&session.getAccessToken)&&<DeleteAccount previewPersonId={session.mode==='preview'?(session.previewPersonId??'preview-admin'):undefined} email={session.email} getAccessToken={session.getAccessToken} onDeleted={()=>void session.signOut?.()}/>}
  </section>
}

/** Permanently removes the signed-in account after the person retypes their email. */
function DeleteAccount({email,getAccessToken,previewPersonId,onDeleted}:{email:string;getAccessToken?:()=>Promise<string>;previewPersonId?:string;onDeleted:()=>void}) {
  const api=useMemo(()=>previewPersonId?createPreviewDatabaseApi(previewPersonId):createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:getAccessToken!}),[getAccessToken,previewPersonId])
  const [open,setOpen]=useState(false),[typed,setTyped]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const matches=typed.trim().toLowerCase()===email.trim().toLowerCase()&&email.trim()!==''
  function close(){setOpen(false);setTyped('');setError('')}
  async function remove(){
    if(!matches)return
    setBusy(true);setError('')
    try{await api.deleteAccount();onDeleted()}
    catch(e){const sent=e instanceof DatabaseApiClientError&&e.status===409?(e.payload as {error?:unknown}|undefined)?.error:undefined;setError(typeof sent==='string'?sent:'Your account could not be deleted right now. Try again.');setBusy(false)}
  }
  if(!open)return <div className="account-row"><div><strong>Delete account</strong><span>Remove your sign-in and leave every organization. This can’t be undone.</span></div>
    <button type="button" className="ws-button ws-button-secondary ws-button-danger" onClick={()=>setOpen(true)}>Delete account</button></div>
  return <form className="account-row account-delete" noValidate aria-labelledby="account-delete-title" onSubmit={e=>{e.preventDefault();void remove()}}>
    <div><strong id="account-delete-title">Delete your account?</strong>
      <span>You will be signed out and removed from every organization. Reservations and history you created stay with each organization without your name or email. If you are the only owner of an organization, make someone else an owner first.</span></div>
    {error&&<p className="ws-notice ws-notice-error" role="alert">{error}</p>}
    <label className="ws-field">Type {email} to confirm<input type="email" value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy}/></label>
    <div className="account-delete-actions">
      <button type="button" className="ws-button ws-button-secondary" onClick={close} disabled={busy}>Cancel</button>
      <button type="submit" className="ws-button ws-button-danger-solid" disabled={!matches||busy}>{busy?'Deleting…':'Delete account permanently'}</button>
    </div>
  </form>
}

function WorkspacesTab() {
  const session=useAppSession(),organizations=session.organizations??[],toast=useToast()
  const selected=organizations.some(o=>o.id===session.selectedOrganizationId)?session.selectedOrganizationId:organizations[0]?.id
  return <>
    <section className="account-card" aria-labelledby="account-workspaces-title">
      <div className="account-card-heading"><h2 id="account-workspaces-title">Your organizations</h2></div>
      {organizations.length?<fieldset className="account-workspaces"><legend className="sr-only">Current organization</legend>
        {organizations.map(org=><label key={org.id} className="account-workspace">
          <input type="radio" name="account-workspace" value={org.id} checked={selected===org.id} onChange={()=>{session.setSelectedOrganizationId?.(org.id);toast.success(`Switched to ${org.name}.`,{id:'account-workspace'})}}/>
          <OrganizationLogo organization={org}/>
          <span className="account-workspace-name"><strong>{org.name}</strong><span>{roleLabel(org.role)}</span></span>
          {selected===org.id&&<span className="ws-status ws-status-accent">Current</span>}
        </label>)}
      </fieldset>:<p className="account-empty">{session.mode==='preview'?'This local preview uses a sample organization. Sign in to see and switch between your own organizations.':'You aren’t in an organization yet. Join one below.'}</p>}
    </section>
    {session.mode==='preview'||session.getAccessToken?<JoinWorkspace previewPersonId={session.mode==='preview'?(session.previewPersonId??'preview-admin'):undefined} getAccessToken={session.getAccessToken} onJoined={async id=>{await session.refreshOrganizations?.();session.setSelectedOrganizationId?.(id)}}/>
      :<section className="account-card"><div className="account-card-heading"><h2>Join another organization</h2><p>Sign in to see invitations for your email.</p></div></section>}
  </>
}

function JoinWorkspace({getAccessToken,previewPersonId,onJoined}:{getAccessToken?:()=>Promise<string>;previewPersonId?:string;onJoined:(organizationId:string)=>Promise<void>}) {
  const api=useMemo(()=>previewPersonId?createPreviewDatabaseApi(previewPersonId):createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:getAccessToken!}),[getAccessToken,previewPersonId])
  const [invitations,setInvitations]=useState<PendingInvitation[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false)
  const toast=useToast()
  const [error,setError]=useState(''),[code,setCode]=useState(''),[codeError,setCodeError]=useState('')
  const load=useCallback(async()=>{setBusy(true);setError('');try{setInvitations((await api.pendingInvitations()).items);setLoaded(true)}catch(e){setError(e instanceof DatabaseApiClientError&&e.status===403?'Verify your sign-in email on the Profile tab, then check again.':'Invitations could not be loaded. Check again in a moment.')}finally{setBusy(false)}},[api])
  useEffect(()=>{void load()},[load])
  // Joining is done once the server accepts; a failed refresh afterwards only means the workspace list is stale.
  async function joined(name:string,organizationId:string){toast.success(`Joined ${name}.`,{id:'account-join'});try{await onJoined(organizationId)}catch{toast.error(`You joined ${name}, but your workspace list could not reload. Refresh the page to switch to it.`,{id:'account-join-reload'})}}
  async function accept(invitation:PendingInvitation){setBusy(true);setError('');try{try{await api.acceptInvitation(invitation.id,invitation.organizationId)}catch{setError('The invitation could not be accepted. Check again before retrying.');return}setInvitations(items=>items.filter(i=>i.id!==invitation.id));await joined(invitation.organizationName,invitation.organizationId)}finally{setBusy(false)}}
  async function joinWithCode(){
    if(!code.trim()){setCodeError('Enter the join code from your organization admin.');return}
    setBusy(true);setError('');setCodeError('')
    let organizationId:string
    try{({organizationId}=await api.joinByCode(code.trim()));setCode('')}
    catch(e){if(e instanceof DatabaseApiClientError&&[400,404].includes(e.status))setCodeError('That join code is not valid. Check it with your organization admin.');else if(e instanceof DatabaseApiClientError&&e.status===409)setCodeError('You were removed from this workspace, so a join code can’t add you back. Ask an administrator to invite you.');else setError(e instanceof DatabaseApiClientError&&e.status===429?'Too many join code attempts. Try again in an hour.':'Join codes could not be checked right now. Try again.');setBusy(false);return}
    try{await joined('the workspace',organizationId)}finally{setBusy(false)}
  }
  return <section className="account-card" aria-labelledby="account-join-title">
    <div className="account-card-heading"><h2 id="account-join-title">Join another organization</h2></div>
    <div className="account-card-body">
      {error&&<p className="ws-notice ws-notice-error" role="alert">{error}</p>}
      {invitations.length>0&&<ul className="account-workspaces account-invitation-list">{invitations.map(invitation=><li key={invitation.id} className="account-workspace">
        <OrganizationLogo organization={{name:invitation.organizationName}}/>
        <span className="account-workspace-name"><strong>{invitation.organizationName}</strong><span>Invited as {formatRole(invitation.role).toLowerCase()}, expires {dateLabel(invitation.expiresAt)}</span></span>
        <button type="button" className="ws-button ws-button-primary" disabled={busy} onClick={()=>void accept(invitation)}>Join {invitation.organizationName}</button>
      </li>)}</ul>}
      {loaded&&!invitations.length&&<div className="account-empty-invitations"><span>No pending invitations. Ask an organization admin to invite this account.</span>
        <button type="button" className="ws-button ws-button-secondary" disabled={busy} onClick={()=>void load()}>{busy?'Checking…':'Check again'}</button></div>}
      <form className="account-code" noValidate onSubmit={e=>{e.preventDefault();void joinWithCode()}}>
        <label className="ws-field">Have a join code?<input value={code} onChange={e=>{setCode(e.target.value);setCodeError('')}} placeholder="ABCDE-FGHJK" maxLength={32} autoComplete="off" spellCheck={false} aria-invalid={codeError?true:undefined} aria-describedby={codeError?'account-code-error':undefined}/></label>
        <button type="submit" className="ws-button ws-button-primary" disabled={busy}>Join organization</button>
        {codeError&&<p id="account-code-error" className="account-field-error" role="alert">{codeError}</p>}
      </form>
    </div>
  </section>
}
