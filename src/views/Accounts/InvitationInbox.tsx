'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import type {PendingInvitation} from '../../types/accounts'
import EmailVerification from '../Production/EmailVerification'
import {Select} from '../../components/workspace/WorkspaceUI'
import {useToast} from '../../components/workspace/Toast'
import { dateLabel } from '../../format'
export default function InvitationInbox({getAccessToken,onAccepted}:{getAccessToken:()=>Promise<string>;onAccepted?:()=>Promise<void>}) {
  const api=useMemo(()=>createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken}),[getAccessToken])
  const [selectedId,setSelectedId]=useState('')
  const [items,setItems]=useState<PendingInvitation[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),toast=useToast()
  const load=useCallback(async()=>{setBusy(true);setError('');try{setItems((await api.pendingInvitations()).items)}catch(error){setError(error instanceof DatabaseApiClientError&&error.status===403?'Verify your sign-in email, then refresh invitations.':'Invitations could not be loaded. Refresh to try again.')}finally{setBusy(false)}},[api])
  useEffect(()=>{void load()},[load])
  async function accept(invitation:PendingInvitation){setBusy(true);setError('');try{try{await api.acceptInvitation(invitation.id,invitation.organizationId)}catch{setError('The invitation could not be accepted. Refresh your organizations and invitations before trying again.');return}setItems(current=>current.filter(i=>i.id!==invitation.id));toast.success(`Joined ${invitation.organizationName}.`,{id:'invitation-inbox'});await onAccepted?.()}catch{toast.error(`You joined ${invitation.organizationName}, but your workspaces could not reload. Refresh the page to open it.`,{id:'invitation-inbox'})}finally{setBusy(false)}}
  return <section className="account-invitations" aria-labelledby="invitation-title"><EmailVerification getAccessToken={getAccessToken}/><h2 id="invitation-title">Join an organization</h2>
    {error&&<p role="alert">{error}</p>}
    <label className="login-workspace-picker">Organization to join
      <Select value={items.some(item=>item.id===selectedId)?selectedId:''} disabled={busy||!items.length} onChange={event=>setSelectedId(event.target.value)}>
        <option value="">{items.length?'Choose an organization you’re invited to':'No organization invitations yet'}</option>
        {items.map(item=><option key={item.id} value={item.id}>{item.organizationName} · {item.role}</option>)}
      </Select>
    </label>
    {items.some(item=>item.id===selectedId)&&<p>Invitation expires {dateLabel(items.find(item=>item.id===selectedId)!.expiresAt)}.</p>}
    <button type="button" className="login-primary" disabled={busy||!items.some(item=>item.id===selectedId)} onClick={()=>{const invitation=items.find(item=>item.id===selectedId);if(invitation)void accept(invitation)}}>Join organization</button>
    {!items.length&&!busy&&!error&&<p>No pending invitations for your verified email. Ask an organization admin to invite this account.</p>}
    <button type="button" disabled={busy} onClick={()=>void load()}>{busy?'Checking invitations…':'Refresh invitations'}</button>
  </section>
}
