'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import type {PendingInvitation} from '../../types/accounts'
import EmailVerification from '../Production/EmailVerification'
export default function InvitationInbox({getAccessToken,onAccepted}:{getAccessToken:()=>Promise<string>;onAccepted?:()=>Promise<void>}) {
  const api=useMemo(()=>createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken}),[getAccessToken])
  const [selectedId,setSelectedId]=useState('')
  const [items,setItems]=useState<PendingInvitation[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('')
  const load=useCallback(async()=>{setBusy(true);setError('');try{setItems((await api.pendingInvitations()).items)}catch(error){setError(error instanceof DatabaseApiClientError&&error.status===403?'Verify your sign-in email, then refresh invitations.':'Invitations could not be loaded. Refresh to try again.')}finally{setBusy(false)}},[api])
  useEffect(()=>{void load()},[load])
  async function accept(invitation:PendingInvitation){setBusy(true);setError('');try{await api.acceptInvitation(invitation.id,invitation.organizationId);setItems(current=>current.filter(i=>i.id!==invitation.id));setStatus(`Joined ${invitation.organizationName}.`);await onAccepted?.()}catch{setError('The invitation could not be accepted. Refresh your organizations and invitations before trying again.')}finally{setBusy(false)}}
  return <section className="account-invitations" aria-labelledby="invitation-title"><EmailVerification getAccessToken={getAccessToken}/><h2 id="invitation-title">Join a workspace</h2>
    {error&&<p role="alert">{error}</p>}{status&&<p role="status">{status}</p>}
    <label className="login-workspace-picker">Workspace to join
      <select value={items.some(item=>item.id===selectedId)?selectedId:''} disabled={busy||!items.length} onChange={event=>setSelectedId(event.target.value)}>
        <option value="">{items.length?'Choose an invited workspace':'No workspace invitations yet'}</option>
        {items.map(item=><option key={item.id} value={item.id}>{item.organizationName} · {item.role}</option>)}
      </select>
    </label>
    {items.some(item=>item.id===selectedId)&&<p>Invitation expires {new Date(items.find(item=>item.id===selectedId)!.expiresAt).toLocaleDateString()}.</p>}
    <button type="button" className="login-primary" disabled={busy||!items.some(item=>item.id===selectedId)} onClick={()=>{const invitation=items.find(item=>item.id===selectedId);if(invitation)void accept(invitation)}}>Join workspace</button>
    {!items.length&&!busy&&!error&&<p>No pending invitations for your verified email. Ask a workspace administrator to invite this account.</p>}
    <button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Checking invitations…':'Refresh invitations'}</button>
  </section>
}
