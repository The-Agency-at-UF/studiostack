'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import {useAppSession} from '../../context/AppSessionContext'
import type {PendingInvitation} from '../../types/accounts'
import type {ApiOrganization} from '../../types/database-api'
import EmailVerification from '../Production/EmailVerification'
import './Account.css'

export type AccountTab='profile'|'workspaces'|'security'
const tabs:{value:AccountTab;label:string}[]=[{value:'profile',label:'Profile'},{value:'workspaces',label:'Workspaces'},{value:'security',label:'Sign-in and security'}]
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
  const session=useAppSession(),[tab,setTab]=useState<AccountTab>(initialTab)
  const organizations=session.organizations??[]
  const current=organizations.find(o=>o.id===session.selectedOrganizationId)??organizations[0]
  return <div className="account-page">
    <header className="account-header">
      <span className="account-avatar" aria-hidden="true">{initials(session.email||'?')}</span>
      <div><p className="ws-context">Account</p><h1>{session.email||'Your account'}</h1>
        {current&&<p className="account-subtitle">{roleLabel(current.role)} of {current.name}</p>}</div>
    </header>
    <div className="account-layout">
      <nav className="account-sections" aria-label="Account sections">
        {tabs.map(item=><button key={item.value} type="button" aria-current={tab===item.value?'page':undefined} onClick={()=>setTab(item.value)}>{item.label}</button>)}
        <hr/>
        <button type="button" className="account-signout-link" onClick={()=>void session.signOut?.()}>Sign out</button>
      </nav>
      <div className="account-content">
        {tab==='profile'&&<ProfileTab/>}
        {tab==='workspaces'&&<WorkspacesTab/>}
        {tab==='security'&&<SecurityTab/>}
      </div>
    </div>
  </div>
}

function ProfileTab() {
  const session=useAppSession()
  return <section className="account-card" aria-labelledby="account-profile-title">
    <div className="account-card-heading"><h2 id="account-profile-title">Profile</h2><p>The email you sign in with. Workspace invitations are sent here.</p></div>
    <div className="account-card-body">
      <label className="ws-field">Email<input type="email" value={session.email} readOnly/></label>
      {session.getAccessToken&&<EmailVerification getAccessToken={session.getAccessToken}/>}
    </div>
  </section>
}

function SecurityTab() {
  const session=useAppSession()
  return <section className="account-card" aria-labelledby="account-security-title">
    <div className="account-card-heading"><h2 id="account-security-title">Sign-in and security</h2></div>
    <div className="account-row"><div><strong>Signed in as</strong><span>{session.email}</span></div>{session.mode==='authenticated'&&<span className="ws-status ws-status-success">Connected securely</span>}</div>
    <div className="account-row"><div><strong>This browser</strong><span>Sign out when you finish on a shared computer.</span></div><button type="button" className="ws-button ws-button-secondary" onClick={()=>void session.signOut?.()}>Sign out</button></div>
  </section>
}

function WorkspacesTab() {
  const session=useAppSession(),organizations=session.organizations??[]
  const selected=organizations.some(o=>o.id===session.selectedOrganizationId)?session.selectedOrganizationId:organizations[0]?.id
  return <>
    <section className="account-card" aria-labelledby="account-workspaces-title">
      <div className="account-card-heading"><h2 id="account-workspaces-title">Your workspaces</h2><p>Choose the workspace you are working in.</p></div>
      {organizations.length?<fieldset className="account-workspaces"><legend className="sr-only">Current workspace</legend>
        {organizations.map(org=><label key={org.id} className="account-workspace">
          <input type="radio" name="account-workspace" value={org.id} checked={selected===org.id} onChange={()=>session.setSelectedOrganizationId?.(org.id)}/>
          <OrganizationLogo organization={org}/>
          <span className="account-workspace-name"><strong>{org.name}</strong><span>{roleLabel(org.role)}</span></span>
          {selected===org.id&&<span className="ws-status ws-status-accent">Current</span>}
        </label>)}
      </fieldset>:<p className="account-empty">You are not in a workspace yet. Join one below.</p>}
    </section>
    {session.getAccessToken?<JoinWorkspace getAccessToken={session.getAccessToken} onJoined={async id=>{await session.refreshOrganizations?.();session.setSelectedOrganizationId?.(id)}}/>
      :<section className="account-card"><div className="account-card-heading"><h2>Join another workspace</h2><p>Sign in to see invitations for your email.</p></div></section>}
  </>
}

function JoinWorkspace({getAccessToken,onJoined}:{getAccessToken:()=>Promise<string>;onJoined:(organizationId:string)=>Promise<void>}) {
  const api=useMemo(()=>createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken}),[getAccessToken])
  const [invitations,setInvitations]=useState<PendingInvitation[]>([]),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[status,setStatus]=useState(''),[code,setCode]=useState(''),[codeError,setCodeError]=useState('')
  const load=useCallback(async()=>{setBusy(true);setError('');try{setInvitations((await api.pendingInvitations()).items);setLoaded(true)}catch(e){setError(e instanceof DatabaseApiClientError&&e.status===403?'Verify your sign-in email on the Profile tab, then check again.':'Invitations could not be loaded. Check again in a moment.')}finally{setBusy(false)}},[api])
  useEffect(()=>{void load()},[load])
  async function accept(invitation:PendingInvitation){setBusy(true);setError('');setStatus('');try{await api.acceptInvitation(invitation.id,invitation.organizationId);setInvitations(items=>items.filter(i=>i.id!==invitation.id));setStatus(`Joined ${invitation.organizationName}.`);await onJoined(invitation.organizationId)}catch{setError('The invitation could not be accepted. Check again before retrying.')}finally{setBusy(false)}}
  async function joinWithCode(){
    if(!code.trim()){setCodeError('Enter the join code from your workspace administrator.');return}
    setBusy(true);setError('');setStatus('');setCodeError('')
    try{const {organizationId}=await api.joinByCode(code.trim());setCode('');setStatus('You joined the workspace.');await onJoined(organizationId)}
    catch(e){if(e instanceof DatabaseApiClientError&&[400,404].includes(e.status))setCodeError('That join code is not valid. Check it with your workspace administrator.');else setError(e instanceof DatabaseApiClientError&&e.status===429?'Too many join code attempts. Try again in an hour.':'Join codes could not be checked right now. Try again.')}
    finally{setBusy(false)}
  }
  return <section className="account-card" aria-labelledby="account-join-title">
    <div className="account-card-heading"><h2 id="account-join-title">Join another workspace</h2><p>Invitations sent to your verified email appear here.</p></div>
    <div className="account-card-body">
      {error&&<p className="ws-notice ws-notice-error" role="alert">{error}</p>}
      {status&&<p className="ws-notice ws-notice-success" role="status">{status}</p>}
      {invitations.length>0&&<ul className="account-workspaces account-invitation-list">{invitations.map(invitation=><li key={invitation.id} className="account-workspace">
        <OrganizationLogo organization={{name:invitation.organizationName}}/>
        <span className="account-workspace-name"><strong>{invitation.organizationName}</strong><span>Invited as {invitation.role} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span></span>
        <button type="button" className="ws-button ws-button-primary" disabled={busy} onClick={()=>void accept(invitation)}>Join {invitation.organizationName}</button>
      </li>)}</ul>}
      {loaded&&!invitations.length&&<div className="account-empty-invitations"><span>No pending invitations. Ask a workspace administrator to invite this account.</span>
        <button type="button" className="ws-button ws-button-secondary" disabled={busy} onClick={()=>void load()}>{busy?'Checking…':'Check again'}</button></div>}
      <form className="account-code" noValidate onSubmit={e=>{e.preventDefault();void joinWithCode()}}>
        <label className="ws-field">Have a join code?<input value={code} onChange={e=>{setCode(e.target.value);setCodeError('')}} placeholder="ABCDE-FGHJK" maxLength={32} autoComplete="off" spellCheck={false} aria-invalid={codeError?true:undefined} aria-describedby={codeError?'account-code-error':undefined}/></label>
        <button type="submit" className="ws-button ws-button-primary" disabled={busy}>Join workspace</button>
        {codeError&&<p id="account-code-error" className="account-field-error">{codeError}</p>}
      </form>
    </div>
  </section>
}
