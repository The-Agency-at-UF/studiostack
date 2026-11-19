'use client'
import {useState} from 'react'
import {useAppSession} from '../context/AppSessionContext'
import {readWorkspace} from '../preview/workspace'
import {readPreview,writePreview} from '../preview/storage'
import {Select} from './workspace/WorkspaceUI'
export default function PreviewControls(){
 const session=useAppSession(),[delivery,setDelivery]=useState(()=>readPreview<'sent'|'failed'|'uncertain'>('studiostack.preview.delivery',()=> 'sent'))
 if(session.mode!=='preview')return null
 return <aside className="ws-preview-controls" aria-label="Local preview controls"><div><strong>Local preview</strong><p>Demo data and files stay in this browser. Invitations and email delivery are simulated.</p></div><label>Preview account<Select value={session.previewPersonId??'preview-admin'} onChange={e=>{const event=new Event('preview-account-change',{cancelable:true});if(window.dispatchEvent(event))session.setPreviewPersonId?.(e.target.value)}}>{readWorkspace().members.filter(m=>m.status!=='suspended'||readWorkspace().invitations.some(i=>i.email===m.email&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now())).map(m=><option key={m.id} value={m.id}>{m.displayName} · {m.status!=='active'?'Join workspace':m.role}</option>)}</Select></label><label>Email simulation<Select value={delivery} onChange={e=>{const value=e.target.value as typeof delivery;writePreview('studiostack.preview.delivery',value);setDelivery(value)}}><option value="sent">Successful delivery</option><option value="failed">Failed delivery</option><option value="uncertain">Uncertain delivery</option></Select></label></aside>
}
