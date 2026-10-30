'use client'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import {useAppSession} from '../../context/AppSessionContext'
import type {AccountClient} from '../../api/accounts'
import type {ApiPage} from '../../types/database-api'
import type {ManagedMember,ManagedTeam,OrganizationInvitation,OrganizationSettings,OrganizationActivity} from '../../types/accounts'
import './Administration.css'
type Section='people'|'teams'|'settings'
async function all<T>(read:(after?:string)=>Promise<ApiPage<T>>){const items:T[]=[];let after:string|undefined;do{const page=await read(after);items.push(...page.items);after=page.nextCursor??undefined}while(after);return items}
const message=(error:unknown)=>error instanceof DatabaseApiClientError?({403:'Your account cannot manage this organization.',409:'The record changed or the action is unavailable. Refresh before trying again.',400:'Check the form values and active team members.',401:'Your session expired. Sign in again.'}[error.status]??'The service is unavailable. Your changes have not been confirmed.'):'The service is unavailable. Your changes have not been confirmed.'
export default function Administration({section}:{section:Section}) {
  const session=useAppSession(),org=session.selectedOrganizationId??session.organizations?.[0]?.id
  const database=useMemo(()=>session.getAccessToken?createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}):null,[session.getAccessToken])
  const api=useMemo(()=>org?database?.accounts(org):null,[org,database])
  const [settings,setSettings]=useState<OrganizationSettings|null>(null),[members,setMembers]=useState<ManagedMember[]>([]),[teams,setTeams]=useState<ManagedTeam[]>([]),[invitations,setInvitations]=useState<OrganizationInvitation[]>([]),[activity,setActivity]=useState<OrganizationActivity[]>([])
  const [directory,setDirectory]=useState<{id:string;name:string}[]>([])
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const generation=useRef(0),mutation=useRef<{key:string;id:string}|null>(null)
  const load=useCallback(async()=>{if(!api)return;const g=generation.current,s=await api.settings();if(g!==generation.current)return;setSettings(s)
    if(!['admin','owner'].includes(s.role)){if(section==='teams'){const rows=await all(after=>database!.groups(org!,{limit:100,after}));if(g===generation.current)setDirectory(rows)}return}
    if(section==='people'){
      const [m,rows]=await Promise.all([all(api.members),all(api.invitations)])
      if(g===generation.current){setMembers(m);setInvitations(rows)}
    }else if(section==='teams'){
      const [m,rows]=await Promise.all([all(api.members),all(api.teams)])
      if(g===generation.current){setMembers(m);setTeams(rows)}
    }else if(section==='settings'){
      const rows=await all(api.activity)
      if(g===generation.current)setActivity(rows)
    }
  },[api,section,database,org])
  useEffect(()=>{const g=++generation.current;setSettings(null);setMembers([]);setTeams([]);setInvitations([]);setActivity([]);setDirectory([]);setError('');setNotice('');setBusy(false);setLoading(true);load().catch(e=>{if(g===generation.current)setError(message(e))}).finally(()=>{if(g===generation.current)setLoading(false)});return()=>{generation.current++}},[load])
  async function run(key:string,task:(client:AccountClient,id:string)=>Promise<unknown>){if(!api||busy)return;const g=generation.current,scope=`${org}:${key}`;if(mutation.current?.key!==scope)mutation.current={key:scope,id:crypto.randomUUID()};setBusy(true);setError('');setNotice('');try{await task(api,mutation.current.id);if(g!==generation.current)return;mutation.current=null;setNotice('Saved.');await session.refreshOrganizations?.();if(g===generation.current)await load()}catch(e){if(g===generation.current)setError(message(e))}finally{if(g===generation.current)setBusy(false)}}
  const title={people:'People & invitations',teams:'Teams',settings:'Organization settings'}[section]
  const owner=settings?.role==='owner',admin=owner||settings?.role==='admin'
  return <main className="administration"><header><div><p className="administration-eyebrow">Organization administration</p><h1>{title}</h1><p>{settings?.name??'Select an organization to continue.'}{settings&&` · ${settings.role}`}</p></div><button disabled={busy||loading||!api} onClick={()=>{setLoading(true);setError('');load().then(()=>session.refreshOrganizations?.()).catch(e=>setError(message(e))).finally(()=>setLoading(false))}}>Refresh</button></header>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading organization…</p>}
    {!loading&&settings&&!admin&&section==='teams'&&<section><h2>Organization teams</h2><ul className="administration-list">{directory.map(t=><li key={t.id}>{t.name}</li>)}</ul>{!directory.length&&<p>No teams yet.</p>}</section>}
    {!loading&&settings&&!admin&&section!=='teams'&&<p>Only organization owners and administrators can manage people, teams and settings.</p>}
    {!loading&&admin&&settings&&<>
      {section==='people'&&<>
        <section><h2>Invite a teammate</h2><form className="administration-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),input={displayName:String(f.get('name')),email:String(f.get('email')),role:String(f.get('role')) as 'member'|'admin'};void run(JSON.stringify({invite:input}),(c,requestId)=>c.invite({...input,requestId}))}}><label>Name<input name="name" maxLength={120} required/></label><label>Email<input name="email" type="email" maxLength={254} required/></label><label>Role<select name="role"><option value="member">Member</option>{owner&&<option value="admin">Administrator</option>}</select></label><button disabled={busy}>Send invitation</button></form><p className="administration-hint">Invitations expire after seven days. Teammates verify their sign-in email before joining.</p></section>
        <section><h2>Members</h2><div className="administration-table"><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Manage</th></tr></thead><tbody>{members.map(member=><MemberRow key={`${member.id}:${member.version}`} member={member} owner={owner} busy={busy} save={(role,status)=>void run(JSON.stringify({member:member.id,version:member.version,role,status}),(c,requestId)=>c.updateMember(member.id,{role,status,version:member.version,requestId}))}/>)}</tbody></table></div></section>
        <section><h2>Invitations</h2>{!invitations.length&&<p>No invitations yet.</p>}<ul className="administration-list">{invitations.map(i=>{const pending=i.status==='pending'&&Date.parse(i.expiresAt)>Date.now(),canManage=owner||i.role==='member';return <li key={i.id}><div><strong>{i.displayName}</strong><span>{i.email} · {i.role}</span><small>{i.status==='pending'&&!pending?'expired':i.status} · Email {i.deliveryStatus} · Expires {new Date(i.expiresAt).toLocaleDateString()}</small></div>{pending&&canManage&&<div className="administration-actions">{['failed','uncertain'].includes(i.deliveryStatus)&&<button disabled={busy} onClick={()=>void run(`retry:${i.id}:${i.version}`,(c,requestId)=>c.retryInvitation(i.id,{version:i.version,requestId}))}>Retry delivery</button>}<button disabled={busy} onClick={()=>void run(`revoke:${i.id}:${i.version}`,(c,requestId)=>c.revokeInvitation(i.id,{version:i.version,requestId}))}>Revoke invitation</button></div>}</li>})}</ul><p className="administration-hint">Uncertain delivery may already have sent email. Check with the teammate before retrying.</p></section>
      </>}
      {section==='teams'&&<><section><h2>Create a team</h2><form className="administration-form" onSubmit={e=>{e.preventDefault();const name=String(new FormData(e.currentTarget).get('name'));void run(`team:${name}`,(c,id)=>c.createTeam(name,id))}}><label>Team name<input name="name" maxLength={120} required/></label><button disabled={busy}>Create team</button></form></section><section><h2>Team membership</h2>{!teams.length&&<p>No teams yet.</p>}{teams.map(team=><TeamEditor key={`${team.id}:${team.version}`} team={team} members={members.filter(m=>m.status==='active')} busy={busy} save={value=>void run(JSON.stringify({team:team.id,...value}),(c,requestId)=>c.updateTeam(team.id,{...value,version:team.version,requestId}))}/>)}</section></>}
      {section==='settings'&&<><section><h2>Workspace settings</h2><form key={settings.version} className="administration-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget),value={name:String(f.get('name')),reservationDays:Number(f.get('days')),version:settings.version};void run(JSON.stringify(value),(c,requestId)=>c.saveSettings({...value,requestId}))}}><label>Organization name<input name="name" maxLength={120} defaultValue={settings.name} required/></label><label>Maximum reservation days<input name="days" type="number" min={1} max={90} defaultValue={settings.reservationDays} required/></label><button disabled={busy}>Save settings</button></form><p className="administration-hint">Production reviewers and Executive Leadership Team membership are managed in Production → Access & notifications.</p></section><section><h2>Administration activity</h2><ul className="administration-list">{[...activity].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(event=><li key={event.id}><div><strong>{event.kind.replaceAll('_',' ')}</strong><span>{event.actorName} · {new Date(event.createdAt).toLocaleString()}</span></div></li>)}</ul>{!activity.length&&<p>No administration activity yet.</p>}</section></>}
    </>}
  </main>
}
function MemberRow({member,owner,busy,save}:{member:ManagedMember;owner:boolean;busy:boolean;save:(role:ManagedMember['role'],status:'active'|'suspended')=>void}) {
  const [role,setRole]=useState(member.role),[status,setStatus]=useState(member.status==='suspended'?'suspended':'active')
  const allowed=owner||member.role==='member'
  return <tr><td><strong>{member.displayName??'Team member'}</strong><small>{member.email??'Email unavailable'}</small></td><td><select aria-label={`Role for ${member.displayName}`} value={role} disabled={!allowed||busy||!owner} onChange={e=>setRole(e.target.value as typeof role)}><option value="member">Member</option><option value="admin">Administrator</option><option value="owner">Owner</option></select></td><td><select aria-label={`Status for ${member.displayName}`} value={status} disabled={!allowed||busy} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="suspended">Suspended</option></select></td><td><button disabled={!allowed||busy||member.status==='invited'||role===member.role&&status===member.status} onClick={()=>save(role,status as 'active'|'suspended')}>Save member</button></td></tr>
}
function TeamEditor({team,members,busy,save}:{team:ManagedTeam;members:ManagedMember[];busy:boolean;save:(value:{name:string;archived:boolean;memberIds:string[]})=>void}) {
  const [name,setName]=useState(team.name),[ids,setIds]=useState(team.memberIds.filter(id=>members.some(m=>m.id===id))),[archived,setArchived]=useState(Boolean(team.archivedAt))
  return <details className="administration-team"><summary>{team.name} · {team.memberIds.length} members{team.archivedAt?' · Archived':''}</summary><form onSubmit={e=>{e.preventDefault();save({name,archived,memberIds:ids})}}><label>Team name<input value={name} maxLength={120} onChange={e=>setName(e.target.value)} required/></label><fieldset><legend>Active organization members</legend>{members.map(m=><label className="administration-checkbox" key={m.id}><input type="checkbox" checked={ids.includes(m.id)} onChange={e=>setIds(current=>e.target.checked?[...current,m.id]:current.filter(id=>id!==m.id))}/>{m.displayName??m.email??'Team member'}</label>)}</fieldset><label className="administration-checkbox"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Archive team</label><button disabled={busy}>Save team</button></form></details>
}
