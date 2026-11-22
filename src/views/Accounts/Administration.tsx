'use client'
import Link from 'next/link'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createPreviewDatabaseApi} from '../../preview/database'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {serverMessage} from '../../api/errorText'
import {authConfiguration} from '../../auth/cognito'
import {useAppSession} from '../../context/AppSessionContext'
import type {ApiPage} from '../../types/database-api'
import type {JoinCode,OrganizationInvitation,OrganizationSettings,OrganizationActivity,PendingAccessRequest,WorkspaceDomain} from '../../types/accounts'
import {Skeleton,LoadError} from '../../components/workspace/WorkspaceUI'
import ConfirmDialog from '../../components/workspace/ConfirmDialog'
import {useUnsavedGuard} from '../../components/workspace/useUnsavedGuard'
import { Pagination } from '../../components/workspace/Pagination'
import { usePagination } from '../../components/workspace/usePagination'
import {useToast} from '../../components/workspace/Toast'
import JoinMethods,{AccessRequests,ConfirmChange,settled,type AdminLists,type PendingConfirm,type Run} from './JoinMethods'
import {uploadOrganizationPhoto} from '../../api/privatePhotos'
import {OrganizationLogo} from '../Account/Account'
import OrganizationHeader from '../Organization/OrganizationHeader'
import { dateLabel } from '../../format'
/** What each administration change says once it is saved, keyed by the prefix of its request key. */
const savedMessages:[string,string][]=[['retry:','Invitation email queued to send again.'],['revoke:','Invitation revoked.'],['approve:','Access request approved.'],['deny:','Access request denied.'],['{"code"','Join code created.'],['{"domain"','Domain added.'],['domain:','Domain setting updated.'],['remove-domain:','Domain removed.'],['revoke-code:','Join code revoked.']]
const savedMessage=(key:string)=>savedMessages.find(([prefix])=>key.startsWith(prefix))?.[1]??'Organization settings saved.'
async function all<T>(read:(after?:string)=>Promise<ApiPage<T>>){const items:T[]=[];let after:string|undefined;do{const page=await read(after);items.push(...page.items);after=page.nextCursor??undefined}while(after);return items}
/** Administration failures: the server's own reason when it gave one, otherwise what happened and what to do. */
const message=(error:unknown,kind:'load'|'save'='save')=>kind==='load'&&!(error instanceof DatabaseApiClientError&&[401,403].includes(error.status))?'This couldn’t load. Check your connection, then try again.':serverMessage(error)??(error instanceof DatabaseApiClientError?({403:'Your account can’t manage this organization. Ask an owner for admin access.',409:'Someone else changed this just now. Refresh, then try again.',400:'Some details weren’t accepted. Check the form and the active team members, then try again.',401:'Your session expired. Sign in again to continue.'} as Record<number,string>)[error.status]??'StudioStack couldn’t confirm the change. Check your connection, then try again.':'StudioStack couldn’t confirm the change. Check your connection, then try again.')

const SECTIONS=[{id:'general',label:'General'},{id:'joining',label:'How people join'},{id:'invitations',label:'Invitations & requests'},{id:'activity',label:'Activity'}] as const
const ACTIVITY:Record<string,string>={
  organization_updated:'Updated organization settings',member_updated:'Updated a member',member_removed:'Removed a member',
  member_joined_code:'Someone joined with a code',member_joined_domain:'Someone joined from an email domain',member_joined_signup:'Someone joined at sign-up',
  membership_granted:'Granted membership',invitation_created:'Sent an invitation',invitation_accepted:'An invitation was accepted',invitation_revoked:'Revoked an invitation',invitation_retried:'Retried an invitation email',
  join_code_created:'Created a join code',join_code_revoked:'Revoked a join code',domain_added:'Added an email domain',domain_updated:'Changed an email domain',domain_removed:'Removed an email domain',
  access_request_approved:'Approved an access request',access_request_denied:'Denied an access request',
}
const activityLabel=(kind:string)=>ACTIVITY[kind]??kind.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())
const when=(iso:string)=>new Date(iso).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})

export default function Administration() {
  const session=useAppSession(),org=session.selectedOrganizationId??session.organizations?.[0]?.id??(session.mode==='preview'?'preview':undefined)
  const database=useMemo(()=>session.mode==='preview'?createPreviewDatabaseApi(session.previewPersonId):session.getAccessToken?createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}):null,[session.getAccessToken,session.mode,session.previewPersonId])
  const api=useMemo(()=>org?database?.accounts(org):null,[org,database])
  const [settings,setSettings]=useState<OrganizationSettings|null>(null),[invitations,setInvitations]=useState<OrganizationInvitation[]>([]),[activity,setActivity]=useState<OrganizationActivity[]>([])
  const [requests,setRequests]=useState<PendingAccessRequest[]>([]),[codes,setCodes]=useState<JoinCode[]>([]),[domains,setDomains]=useState<WorkspaceDomain[]>([])
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),toast=useToast()
  const [current,setCurrent]=useState<string>('general')
  const generation=useRef(0),mutation=useRef<{key:string;id:string}|null>(null)
  // Background reloads can overlap; only the newest one, started after the latest change, may update the page.
  const loads=useRef(0)
  const load=useCallback(async()=>{if(!api)return;const g=generation.current,sequence=++loads.current,stale=()=>g!==generation.current||sequence!==loads.current
    const s=await api.settings();if(stale())return;setSettings(s)
    if(!['admin','owner'].includes(s.role))return
    const [rows,pending,joinCodes,owned,events]=await Promise.all([all(api.invitations),all(api.accessRequests),all(api.joinCodes),s.role==='owner'?all(api.domains):Promise.resolve([]),all(api.activity)])
    if(!stale()){setInvitations(rows);setRequests(pending);setCodes(joinCodes);setDomains(owned);setActivity(events)}
  },[api])
  const [attempt,setAttempt]=useState(0),[pending,setPending]=useState<PendingConfirm|null>(null)
  useEffect(()=>{const g=++generation.current;setSettings(null);setInvitations([]);setActivity([]);setRequests([]);setCodes([]);setDomains([]);setError('');setBusy(false);setLoading(true);load().catch(e=>{if(g===generation.current)setError(message(e,'load'))}).finally(()=>{if(g===generation.current)setLoading(false)});return()=>{generation.current++}},[load,attempt])
  const lists=():AdminLists=>({invitations,requests,codes,domains})
  const put=(l:AdminLists)=>{setInvitations(l.invitations);setRequests(l.requests);setCodes(l.codes);setDomains(l.domains)}
  /**
   * Sends one administration change. With `optimistic`, the lists show the change at once, a rejected
   * change puts them back, and the page reloads in the background instead of staying locked.
   */
  const run:Run=async(key,task,optimistic)=>{if(!api||busy)return;const g=generation.current,scope=`${org}:${key}`,before=lists();if(mutation.current?.key!==scope)mutation.current={key:scope,id:crypto.randomUUID()};loads.current++;setBusy(true);setError('');toast.dismiss('organization-settings');if(optimistic)put(optimistic.apply(before))
    const reload=async()=>{await session.refreshOrganizations?.();if(g===generation.current)await load()}
    // The change is saved before the reload; a failed reload only means the page may be out of date.
    const reloadFailed=()=>{if(g===generation.current)toast.error('The change was saved, but the page could not reload. Refresh to see the latest.',{id:'organization-settings-reload'})}
    try{const result=await task(api,mutation.current.id);if(g!==generation.current)return;mutation.current=null;toast.success(savedMessage(key),{id:'organization-settings'})
      if(optimistic){if(optimistic.settle)put(optimistic.settle(optimistic.apply(before),result));reload().catch(reloadFailed)}else await reload().catch(reloadFailed)
      return result}
    catch(e){if(g===generation.current){if(optimistic)put(before);toast.error(message(e),{id:'organization-settings'})}}finally{if(g===generation.current)setBusy(false)}}
  const owner=settings?.role==='owner',admin=owner||settings?.role==='admin'
  const ready=!loading&&admin&&!!settings
  // Highlight the index entry for the section the reader has scrolled into; the last one once the page bottoms out.
  useEffect(()=>{
    if(!ready)return
    let frame=0
    const update=()=>{frame=0
      const atEnd=window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-2
      const passed=SECTIONS.filter(({id})=>(document.getElementById(id)?.getBoundingClientRect().top??Infinity)<=window.innerHeight*.3)
      setCurrent(atEnd?SECTIONS[SECTIONS.length-1].id:passed[passed.length-1]?.id??SECTIONS[0].id)}
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)}
    update();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule)
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule)}
  },[ready])
  const waiting=requests.length+invitations.filter(i=>i.status==='pending'&&Date.parse(i.expiresAt)>Date.now()).length
  const events=[...activity].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  const activityPage=usePagination(events,[org])
  const invitationPage=usePagination(invitations,[org])
  return <main className="administration administration-settings-page workspace-surface">
    <OrganizationHeader settings={settings} active="settings"/>
    <ConfirmChange pending={pending} onDone={()=>setPending(null)}/>
    {error&&(!settings&&!loading?<LoadError what="Organization settings" message={error} onRetry={()=>setAttempt(n=>n+1)}/>:<p role="alert">{error}</p>)}{loading&&<Skeleton label="Loading organization…" variant="row" count={4}/>}
    {!loading&&settings&&!admin&&<p>Only organization owners and administrators can manage the organization.</p>}
    {ready&&<div className="administration-layout">
      <nav className="administration-index" aria-label="Settings sections">
        {SECTIONS.map(s=><a key={s.id} href={`#${s.id}`} aria-current={current===s.id?'location':undefined} onClick={()=>setCurrent(s.id)}>{s.label}{s.id==='invitations'&&waiting>0&&<><span className="administration-count" aria-hidden="true">{waiting}</span><span className="ws-sr-only">, {waiting} pending</span></>}</a>)}
      </nav>
      <div className="administration-sections">
        <section id="general" className="administration-panel ws-enter" aria-labelledby="general-title">
          <header className="administration-panel-header"><h2 id="general-title">General</h2><p>How your organization appears to members and to people searching for it.</p></header>
          <SettingsForm key={settings.version} settings={settings} busy={busy} run={run} logoUrl={session.organizations?.find(o=>o.id===org)?.logoUrl??null} uploadLogo={async file=>{if(!database||!org)throw new Error('Sign in to upload a logo');return (await uploadOrganizationPhoto(file,org,database)).photoId}}/>
          <p className="administration-hint">Production Leads and Executive Leadership Team members are chosen in <Link href="/production/">Production</Link> → Production roles.</p>
        </section>
        <section id="joining" className="administration-panel" aria-labelledby="joining-title">
          <header className="administration-panel-header"><h2 id="joining-title">How people join</h2><p>Self-service ways into the organization. Everyone who joins this way starts as a member.</p></header>
          <JoinMethods owner={owner} busy={busy} run={run} codes={codes} domains={domains}/>
        </section>
        <section id="invitations" className="administration-panel" aria-labelledby="invitations-title">
          <header className="administration-panel-header"><h2 id="invitations-title">Invitations &amp; requests</h2><p>Invitations you’ve sent and what happened to them. Send new ones from People.</p></header>
          <AccessRequests key={org} busy={busy} run={run} requests={requests}/>
          {invitations.length>0&&<div className="administration-group">{requests.length>0&&<h3>Invitations</h3>}
            <ul className="administration-list">{invitationPage.pageRows.map(i=>{const pending=i.status==='pending'&&Date.parse(i.expiresAt)>Date.now();return <li key={i.id}><div><strong>{i.displayName}</strong><span>{i.email} · {i.role==='admin'?'Admin':'Member'}</span><small>{pending?`Waiting to accept · ${({queued:'Email queued',sending:'Email sending',sent:'Email sent',skipped:'Email skipped',failed:'Email failed to send',uncertain:'Email delivery unconfirmed'} as const)[i.deliveryStatus]} · Expires ${dateLabel(i.expiresAt)}`:i.status==='accepted'?'Joined':i.status==='revoked'?'Revoked':'Expired'}</small></div>{pending&&<div className="administration-actions">{['failed','uncertain'].includes(i.deliveryStatus)&&<button className="administration-secondary" disabled={busy} onClick={()=>void run(`retry:${i.id}:${i.version}`,(c,requestId)=>c.retryInvitation(i.id,{version:i.version,requestId}))}>Retry delivery</button>}<button className="administration-quiet administration-danger" disabled={busy} onClick={()=>setPending({title:'Revoke this invitation?',subject:`${i.displayName} · ${i.email}`,description:'The link in their email stops working. You can invite them again later.',confirmLabel:'Revoke invitation',returnFocus:()=>document.getElementById('invitations-title'),go:()=>void run(`revoke:${i.id}:${i.version}`,(c,requestId)=>c.revokeInvitation(i.id,{version:i.version,requestId}),{apply:l=>({...l,invitations:l.invitations.map(v=>v.id===i.id?{...v,status:'revoked'}:v)}),settle:(l,saved)=>({...l,invitations:settled(l.invitations,'id',saved)})})})}>Revoke invitation<span className="ws-sr-only"> for {i.displayName}</span></button></div>}</li>})}</ul>
            <Pagination label="Invitations" pagination={invitationPage.pagination}/>
            {invitations.some(i=>i.status==='pending'&&i.deliveryStatus==='uncertain')&&<p className="administration-hint">When delivery is unconfirmed the email may still have arrived. Check with the teammate before retrying.</p>}
          </div>}
          {!requests.length&&!invitations.length&&<p className="administration-empty"><span>Nothing waiting. Access requests and open invitations show up here.</span></p>}
        </section>
        <section id="activity" className="administration-panel" aria-labelledby="activity-title">
          <header className="administration-panel-header"><h2 id="activity-title">Activity</h2><p>Changes to members, access and settings.</p></header>
          {events.length>0
            ?<ul className="administration-list administration-activity">{activityPage.pageRows.map(event=><li key={event.id}><div><strong>{activityLabel(event.kind)}</strong><span><span className="ws-sr-only">By </span>{event.actorName} · <time dateTime={event.createdAt}>{when(event.createdAt)}</time></span></div></li>)}</ul>
            :<p className="administration-empty"><span>No administration activity yet.</span></p>}
          <Pagination label="Activity" pagination={activityPage.pagination}/>
        </section>
      </div>
    </div>}
  </main>
}

function SettingsForm({settings,busy,run,logoUrl,uploadLogo}:{settings:OrganizationSettings;busy:boolean;run:Run;logoUrl:string|null;uploadLogo:(file:File)=>Promise<string>}) {
  // undefined keeps the saved logo, null removes it, a File replaces it on save.
  const [logo,setLogo]=useState<File|null|undefined>(undefined),[preview,setPreview]=useState<string|null>(null),[edited,setEdited]=useState(false)
  useEffect(()=>{if(!logo){setPreview(null);return}const url=URL.createObjectURL(logo);setPreview(url);return()=>URL.revokeObjectURL(url)},[logo])
  const shownLogo=logo===null?null:preview??(settings.logoPhotoId?logoUrl:null)
  const dirty=edited||logo!==undefined
  const form=useRef<HTMLFormElement>(null)
  // Leaving with unsaved settings asks first; Discard is the only quiet way out.
  const [leave,setLeave]=useState<(()=>void)|null>(null)
  useUnsavedGuard(dirty,proceed=>setLeave(()=>proceed))
  return <>{leave&&<ConfirmDialog title="Discard unsaved settings?" description="Your changes to the organization’s name, location, reservation limit or logo haven’t been saved." confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={()=>setLeave(null)} onConfirm={()=>{const go=leave;setLeave(null);form.current?.reset();go()}}/>}<form ref={form} className="administration-settings" onInput={()=>setEdited(true)} onReset={()=>{setEdited(false);setLogo(undefined)}} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),value={name:String(f.get('name')),reservationDays:Number(f.get('days')),location:String(f.get('location')).trim()||null,version:settings.version},file=logo
    void run(JSON.stringify({...value,logo:file===undefined?'keep':file&&[file.name,file.size,file.lastModified]}),async(c,requestId)=>c.saveSettings({...value,...(file===undefined?{}:{logoPhotoId:file?await uploadLogo(file):null}),requestId}))}}>
    <fieldset className="administration-logo"><legend>Organization logo</legend>
      <OrganizationLogo organization={{name:settings.name,logoUrl:shownLogo}}/>
      <div className="administration-logo-controls">
        <div className="administration-actions">
          <label className="administration-logo-pick">{shownLogo?'Replace logo':'Upload logo'}<input type="file" accept="image/*,.heic,.heif,.avif" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)setLogo(file);e.target.value=''}}/></label>
          {shownLogo&&<button type="button" className="administration-quiet administration-danger" disabled={busy} onClick={()=>setLogo(null)}>Remove logo</button>}
        </div>
        <small>{logo===undefined?'A square image works best. Members see it next to the organization name.':logo?'New logo selected. Save settings to apply it.':'The logo will be removed when you save settings.'}</small>
      </div>
    </fieldset>
    <label>Organization name<input name="name" maxLength={120} defaultValue={settings.name} required/></label>
    <label>Location<input name="location" maxLength={80} defaultValue={settings.location??''} placeholder="Gainesville"/><small className="administration-field-hint">Shown under your name when people search for organizations.</small></label>
    <label>Maximum reservation days<span className="administration-days"><input name="days" type="number" min={1} max={90} defaultValue={settings.reservationDays} required/><span aria-hidden="true">days</span></span></label>
    <div className="administration-form-footer">
      {dirty&&<span className="administration-dirty">Unsaved changes</span>}
      <button type="reset" className="administration-secondary" disabled={busy||!dirty}>Discard</button>
      <button type="submit" className="ws-button-primary" disabled={busy}>Save settings</button>
    </div>
  </form></>
}
