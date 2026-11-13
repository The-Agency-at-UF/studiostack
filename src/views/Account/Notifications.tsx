'use client'
import {useEffect,useMemo,useState} from 'react'
import {equipmentError,useLiveOrganization,type DatabaseApi} from '../Equipment/live'
import {getCached,invalidateCache} from '../../api/cache'
import type {AlertPreferences} from '../../types/alerts'

/** Email preferences for the current workspace. Alerts always appear in the app; email is opt-in. */
export default function NotificationsTab() {
  const live=useLiveOrganization()
  const heading=<div className="account-card-heading"><h2 id="account-notifications-title">Notifications</h2>
    <p>Alerts always appear on the Alerts page. Optional emails go to your verified sign-up email.</p></div>
  if(!live||live.organization.id==='preview')return <section className="account-card" aria-labelledby="account-notifications-title">{heading}
    <p className="account-empty">Sign in and choose a workspace to manage email notifications.</p></section>
  return <section className="account-card" aria-labelledby="account-notifications-title">{heading}
    <EmailPreferences key={live.organization.id} api={live.api} org={live.organization.id} orgName={live.organization.name}/>
  </section>
}

function EmailPreferences({api,org,orgName}:{api:DatabaseApi;org:string;orgName:string}) {
  const client=useMemo(()=>api.alerts(org),[api,org])
  const cached=getCached<{preferences?:AlertPreferences}>(`alerts:${org}`)?.preferences
  const [preferences,setPreferences]=useState<AlertPreferences>(cached??{equipmentEmail:false,version:0})
  const [loading,setLoading]=useState(!cached),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{let active=true;client.preferences().then(p=>{if(active)setPreferences(p)}).catch(e=>{if(active)setError(equipmentError(e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[client])
  // Optimistic: the checkbox flips at once and returns to the saved preference if the update fails.
  async function change(equipmentEmail:boolean){
    if(saving)return
    const previous=preferences
    setSaving(true);setError('');setNotice('');setPreferences({...previous,equipmentEmail})
    try{const saved=await client.updatePreferences({...previous,equipmentEmail});invalidateCache(`alerts:${org}`);setPreferences(saved);setNotice(equipmentEmail?'Equipment email enabled.':'Equipment email disabled.')}
    catch(e){setPreferences(previous);setError(equipmentError(e))}
    finally{setSaving(false)}
  }
  return <>
    {(error||notice)&&<div className="account-card-body">
      {error&&<p className="ws-notice ws-notice-error" role="alert">{error}</p>}
      {notice&&<p className="ws-notice ws-notice-success" role="status">{notice}</p>}
    </div>}
    <label className="account-row account-toggle">
      <div><strong id="account-equipment-email">Email me about equipment alerts</strong><span id="account-equipment-email-hint">Overdue returns, report activity and booking conflicts in {orgName}.</span></div>
      <input type="checkbox" aria-labelledby="account-equipment-email" aria-describedby="account-equipment-email-hint" checked={preferences.equipmentEmail} disabled={loading||saving} onChange={e=>void change(e.target.checked)}/>
    </label>
    <div className="account-row"><div><strong>Production decision emails</strong><span>These follow the workspace’s Executive Leadership Team settings.</span></div></div>
  </>
}
