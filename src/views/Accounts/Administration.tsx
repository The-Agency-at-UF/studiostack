'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import {useAppSession} from '../../context/AppSessionContext'
import type {AccountClient} from '../../api/accounts'
import type {ApiPage} from '../../types/database-api'
import type {JoinCode,OrganizationInvitation,OrganizationSettings,OrganizationActivity,PendingAccessRequest,WorkspaceDomain} from '../../types/accounts'
import {Skeleton} from '../../components/workspace/WorkspaceUI'
import JoinMethods from './JoinMethods'
import {uploadOrganizationPhoto} from '../../api/privatePhotos'
import {OrganizationLogo} from '../Account/Account'
import OrganizationHeader from '../Organization/OrganizationHeader'
import './Administration.css'
async function all<T>(read:(after?:string)=>Promise<ApiPage<T>>){const items:T[]=[];let after:string|undefined;do{const page=await read(after);items.push(...page.items);after=page.nextCursor??undefined}while(after);return items}
const message=(error:unknown)=>error instanceof DatabaseApiClientError?({403:'Your account cannot manage this organization.',409:'The record changed or the action is unavailable. Refresh before trying again.',400:'Check the form values and active team members.',401:'Your session expired. Sign in again.'}[error.status]??'The service is unavailable. Your changes have not been confirmed.'):'The service is unavailable. Your changes have not been confirmed.'
export default function Administration() {
  const session=useAppSession(),org=session.selectedOrganizationId??session.organizations?.[0]?.id
  const database=useMemo(()=>session.getAccessToken?createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}):null,[session.getAccessToken])
  const api=useMemo(()=>org?database?.accounts(org):null,[org,database])
  const [settings,setSettings]=useState<OrganizationSettings|null>(null),[invitations,setInvitations]=useState<OrganizationInvitation[]>([]),[activity,setActivity]=useState<OrganizationActivity[]>([])
  const [requests,setRequests]=useState<PendingAccessRequest[]>([]),[codes,setCodes]=useState<JoinCode[]>([]),[domains,setDomains]=useState<WorkspaceDomain[]>([])
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const generation=useRef(0),mutation=useRef<{key:string;id:string}|null>(null)
  const load=useCallback(async()=>{if(!api)return;const g=generation.current,s=await api.settings();if(g!==generation.current)return;setSettings(s)
    if(!['admin','owner'].includes(s.role))return
    const [rows,pending,joinCodes,owned,events]=await Promise.all([all(api.invitations),all(api.accessRequests),all(api.joinCodes),s.role==='owner'?all(api.domains):Promise.resolve([]),all(api.activity)])
    if(g===generation.current){setInvitations(rows);setRequests(pending);setCodes(joinCodes);setDomains(owned);setActivity(events)}
  },[api])
  useEffect(()=>{const g=++generation.current;setSettings(null);setInvitations([]);setActivity([]);setRequests([]);setCodes([]);setDomains([]);setError('');setNotice('');setBusy(false);setLoading(true);load().catch(e=>{if(g===generation.current)setError(message(e))}).finally(()=>{if(g===generation.current)setLoading(false)});return()=>{generation.current++}},[load])
  async function run(key:string,task:(client:AccountClient,id:string)=>Promise<unknown>):Promise<unknown>{if(!api||busy)return;const g=generation.current,scope=`${org}:${key}`;if(mutation.current?.key!==scope)mutation.current={key:scope,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');try{const result=await task(api,mutation.current.id);if(g!==generation.current)return;mutation.current=null;setNotice('Saved.');await session.refreshOrganizations?.();if(g===generation.current)await load();return result}catch(e){if(g===generation.current)setError(message(e))}finally{if(g===generation.current)setBusy(false)}}
  const owner=settings?.role==='owner',admin=owner||settings?.role==='admin'
  return <main className="administration workspace-surface">
    <OrganizationHeader settings={settings} active="settings"/>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<Skeleton label="Loading organization…" variant="row" count={4}/>}
    {!loading&&settings&&!admin&&<p>Only organization owners and administrators can manage the organization.</p>}
    {!loading&&admin&&settings&&<>
        <section id="invitations" className="ws-enter"><h2>Invitations</h2>{!invitations.length&&<p>No invitations yet.</p>}<ul className="administration-list">{invitations.map(i=>{const pending=i.status==='pending'&&Date.parse(i.expiresAt)>Date.now();return <li key={i.id}><div><strong>{i.displayName}</strong><span>{i.email} · {i.role}</span><small>{i.status==='pending'&&!pending?'expired':i.status} · Email {i.deliveryStatus} · Expires {new Date(i.expiresAt).toLocaleDateString()}</small></div>{pending&&<div className="administration-actions">{['failed','uncertain'].includes(i.deliveryStatus)&&<button disabled={busy} onClick={()=>void run(`retry:${i.id}:${i.version}`,(c,requestId)=>c.retryInvitation(i.id,{version:i.version,requestId}))}>Retry delivery</button>}<button disabled={busy} onClick={()=>void run(`revoke:${i.id}:${i.version}`,(c,requestId)=>c.revokeInvitation(i.id,{version:i.version,requestId}))}>Revoke invitation</button></div>}</li>})}</ul><p className="administration-hint">Send new invitations from People. Uncertain delivery may already have sent email. Check with the teammate before retrying.</p></section>
        <JoinMethods owner={owner} busy={busy} run={run} requests={requests} codes={codes} domains={domains}/>
      <section className="ws-enter"><h2>Workspace settings</h2><SettingsForm key={settings.version} settings={settings} busy={busy} run={run} logoUrl={session.organizations?.find(o=>o.id===org)?.logoUrl??null} uploadLogo={async file=>{if(!database||!org)throw new Error('Sign in to upload a logo');return (await uploadOrganizationPhoto(file,org,database)).photoId}}/><p className="administration-hint">Production reviewers and Executive Leadership Team membership are managed in Production → Access & notifications.</p></section><section className="ws-enter"><h2>Administration activity</h2><ul className="administration-list">{[...activity].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(event=><li key={event.id}><div><strong>{event.kind.replaceAll('_',' ')}</strong><span>{event.actorName} · {new Date(event.createdAt).toLocaleString()}</span></div></li>)}</ul>{!activity.length&&<p>No administration activity yet.</p>}</section>
    </>}
  </main>
}
type Run=(key:string,task:(client:AccountClient,id:string)=>Promise<unknown>)=>Promise<unknown>
function SettingsForm({settings,busy,run,logoUrl,uploadLogo}:{settings:OrganizationSettings;busy:boolean;run:Run;logoUrl:string|null;uploadLogo:(file:File)=>Promise<string>}) {
  // undefined keeps the saved logo, null removes it, a File replaces it on save.
  const [logo,setLogo]=useState<File|null|undefined>(undefined),[preview,setPreview]=useState<string|null>(null)
  useEffect(()=>{if(!logo){setPreview(null);return}const url=URL.createObjectURL(logo);setPreview(url);return()=>URL.revokeObjectURL(url)},[logo])
  const shownLogo=logo===null?null:preview??(settings.logoPhotoId?logoUrl:null)
  return <form className="administration-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),value={name:String(f.get('name')),reservationDays:Number(f.get('days')),location:String(f.get('location')).trim()||null,version:settings.version},file=logo
    void run(JSON.stringify({...value,logo:file===undefined?'keep':file&&[file.name,file.size,file.lastModified]}),async(c,requestId)=>c.saveSettings({...value,...(file===undefined?{}:{logoPhotoId:file?await uploadLogo(file):null}),requestId}))}}>
    <fieldset className="administration-logo"><legend>Workspace logo</legend>
      <OrganizationLogo organization={{name:settings.name,logoUrl:shownLogo}}/>
      <label className="administration-logo-pick">{shownLogo?'Replace logo':'Upload logo'}<input type="file" accept="image/*,.heic,.heif,.avif" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)setLogo(file);e.target.value=''}}/></label>
      {shownLogo&&<button type="button" className="administration-secondary" disabled={busy} onClick={()=>setLogo(null)}>Remove logo</button>}
      <small>{logo===undefined?'A square image works best. Members see it next to the workspace name.':logo?'New logo selected. Save settings to apply it.':'The logo will be removed when you save settings.'}</small>
    </fieldset>
    <label>Organization name<input name="name" maxLength={120} defaultValue={settings.name} required/></label><label>Location<input name="location" maxLength={80} defaultValue={settings.location??''} placeholder="Gainesville"/><small className="administration-hint">Shown under your name when people search for organizations.</small></label><label>Maximum reservation days<input name="days" type="number" min={1} max={90} defaultValue={settings.reservationDays} required/></label><button disabled={busy}>Save settings</button></form>
}
