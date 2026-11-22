'use client'
import {useEffect,useMemo,useState} from 'react'
import {equipmentError,useLiveOrganization,type DatabaseApi} from '../Equipment/live'
import {getCached,invalidateCache} from '../../api/cache'
import type {AlertPreferences} from '../../types/alerts'
import {useToast} from '../../components/workspace/Toast'
import {Button} from '../../components/workspace/WorkspaceUI'

/** Email preferences for the current workspace. Alerts always appear in the app; email is opt-in. */
export default function NotificationsTab() {
  const live=useLiveOrganization()
  const heading=<div className="account-card-heading"><h2 id="account-notifications-title">Notifications</h2>
    <p>Alerts always appear on the Alerts page. Optional emails go to your verified sign-up email.</p></div>
  if(!live)return <section className="account-card" aria-labelledby="account-notifications-title">{heading}
    <p className="account-empty">Sign in and choose a workspace to manage email notifications.</p></section>
  return <section className="account-card" aria-labelledby="account-notifications-title">{heading}
    <EmailPreferences key={live.organization.id} api={live.api} org={live.organization.id} orgName={live.organization.name}/>
  </section>
}

function EmailPreferences({api,org,orgName}:{api:DatabaseApi;org:string;orgName:string}) {
  const client=useMemo(()=>api.alerts(org),[api,org])
  const cached=getCached<{preferences?:AlertPreferences}>(`alerts:${org}`)?.preferences
  const [preferences,setPreferences]=useState<AlertPreferences>(cached??{equipmentEmail:false,version:0})
  const [loading,setLoading]=useState(!cached),[saving,setSaving]=useState(false),[error,setError]=useState(''),toast=useToast()
  // Until the real preference loads, the checkbox stays locked: a default "off" must never be edited as if it were saved.
  const [loaded,setLoaded]=useState(Boolean(cached)),[attempt,setAttempt]=useState(0)
  useEffect(()=>{let active=true;setLoading(true);client.preferences().then(p=>{if(active){setPreferences(p);setLoaded(true);setError('')}}).catch(e=>{if(active)setError(equipmentError(e,'load'))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[client,attempt])
  // Optimistic: the checkbox flips at once and returns to the saved preference if the update fails.
  async function change(equipmentEmail:boolean){
    if(saving)return
    const previous=preferences
    setSaving(true);setError('');setPreferences({...previous,equipmentEmail})
    try{const saved=await client.updatePreferences({...previous,equipmentEmail});invalidateCache(`alerts:${org}`);setPreferences(saved);toast.success(equipmentEmail?'Equipment email enabled.':'Equipment email disabled.',{id:'account-notifications'})}
    catch(e){setPreferences(previous);setError(equipmentError(e))}
    finally{setSaving(false)}
  }
  return <>
    {error&&<div className="account-card-body">
      {error&&<div className="ws-notice ws-notice-error" role="alert"><div className="ws-notice-body">{loaded?error:<><strong>Your email preference couldn’t load.</strong> {error}</>}</div>{!loaded&&<div className="ws-notice-action"><Button disabled={loading} onClick={()=>setAttempt(n=>n+1)}>{loading?'Retrying…':'Retry'}</Button></div>}</div>}
    </div>}
    <label className="account-row account-toggle">
      <div><strong id="account-equipment-email">Email me about equipment alerts</strong><span id="account-equipment-email-hint">Overdue returns, report activity and reservation conflicts in {orgName}.</span></div>
      <input type="checkbox" aria-labelledby="account-equipment-email" aria-describedby="account-equipment-email-hint" checked={preferences.equipmentEmail} disabled={loading||saving||!loaded} aria-busy={!loaded||undefined} onChange={e=>void change(e.target.checked)}/>
    </label>
    <div className="account-row"><div><strong>Production decision emails</strong><span>These follow the workspace’s Executive Leadership Team settings.</span></div></div>
  </>
}
