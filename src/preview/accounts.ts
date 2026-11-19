import {PreviewError} from './errors'
import type {AccountClient} from '../api/accounts'
import {canChangeMemberAccess} from '../accounts/member-permissions'
import type {JoinCode,OrganizationInvitation} from '../types/accounts'
import type {ProductionSettings} from '../types/production'
import {readPreview,writePreview} from './storage'
import {readWorkspace,mutateWorkspace,memberFor,requirePreviewAdmin,previewActivity,previewReceipt,previewVersion} from './workspace'
const page=<T>(items:T[])=>({items:structuredClone(items),nextCursor:null})
const label=(text:string,max:number)=>{if(!text.trim()||text.trim().length>max)throw new PreviewError('Check the required fields and text length.');return text.trim()}
export function createPreviewAccounts(person:string):AccountClient {
 const admin=()=>{const s=readWorkspace();requirePreviewAdmin(person,s);return s}
 const mutate=<T>(requestId:string,input:unknown,fn:(s:ReturnType<typeof readWorkspace>)=>T,owner=false)=>mutateWorkspace(s=>{requirePreviewAdmin(person,s,owner);return previewReceipt(s,person,requestId,input,()=>fn(s))})
 const invitation=(s:ReturnType<typeof readWorkspace>,id:string,version:number)=>{const row=s.invitations.find(r=>r.id===id);if(!row||row.status!=='pending')throw new PreviewError('This invitation is no longer pending.');previewVersion(row,version);return row}
 return {
 settings:async()=>{const s=readWorkspace();return {...s.settings,role:memberFor(person,s).role}},
 saveSettings:async input=>mutate(input.requestId,input,s=>{previewVersion(s.settings,input.version);if(!Number.isInteger(input.reservationDays)||input.reservationDays<1||input.reservationDays>90)throw new PreviewError('Choose a maximum reservation length from 1 to 90 days.');if(input.logoPhotoId&&!s.photos[input.logoPhotoId]?.ready)throw new PreviewError('Complete the logo upload first.');Object.assign(s.settings,{...(input.location!==undefined?{location:input.location?.trim()||null}:{}),...(input.logoPhotoId!==undefined?{logoPhotoId:input.logoPhotoId}:{}),name:label(input.name,120),reservationDays:input.reservationDays,version:s.settings.version+1});previewActivity(s,person,'organization_updated',s.settings.id);return {...s.settings,role:memberFor(person,s).role}}),
 directory:async()=>{const s=readWorkspace();memberFor(person,s);return page(s.members.filter(m=>m.status==='active').map(m=>({id:m.id,displayName:m.displayName??'Preview teammate',role:m.role})))},
 members:async()=>page(admin().members.filter(m=>m.status!=='suspended').map(m=>({...m,self:m.id===person}))),
 updateMember:async(id,input)=>mutate(input.requestId,{id,input},s=>{
  const actor=memberFor(person,s),row=s.members.find(m=>m.id===id);if(!row)throw new PreviewError('Member not found.');previewVersion(row,input.version)
  if(id===person)throw new PreviewError('Another administrator must change your access.');
  if(row.role==='owner'&&actor.role!=='owner'||input.role==='owner'&&actor.role!=='owner')throw new PreviewError('Only owners can manage owner roles.')
  if(row.status!==input.status&&!canChangeMemberAccess(actor.role,row.role))throw new PreviewError('This account cannot change that member’s access.')
  if(row.role==='owner'&&input.role!=='owner'&&!s.members.some(m=>m.id!==id&&m.role==='owner'&&m.status==='active'))throw new PreviewError('Keep at least one active organization owner.')
  Object.assign(row,{role:input.role,status:input.status,version:row.version+1})
  if(input.status==='suspended'){
   const production=readPreview<{settings:ProductionSettings;[key:string]:unknown}|null>('studiostack-production-preview-v1',()=>null)
   if(production){production.settings={...production.settings,reviewerIds:production.settings.reviewerIds.filter(p=>p!==id),executiveIds:production.settings.executiveIds.filter(p=>p!==id),version:production.settings.version+1};writePreview('studiostack-production-preview-v1',production)}
  }
  previewActivity(s,person,'member_updated',id,{role:row.role,status:row.status});return row
 }),
 activity:async()=>page(admin().activity),
 invitations:async()=>page(admin().invitations),
 invite:async input=>mutate(input.requestId,input,s=>{
  const email=input.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new PreviewError('Enter a valid email address.')
  if(s.members.some(m=>m.email?.toLowerCase()===email&&m.status==='active')||s.invitations.some(i=>i.email===email&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now()))throw new PreviewError('This person is already a member or has a pending invitation.')
  const now=new Date().toISOString(),row:OrganizationInvitation={id:crypto.randomUUID(),email,displayName:input.displayName?.trim()||email,role:input.role,status:'pending',deliveryStatus:readPreview<'sent'|'failed'|'uncertain'>('studiostack.preview.delivery',()=> 'sent'),attempts:1,createdAt:now,expiresAt:new Date(Date.now()+7*86400000).toISOString(),version:1};s.invitations.push(row);previewActivity(s,person,'invitation_created',row.id,{email,simulated:true});return row
 }),
 revokeInvitation:async(id,input)=>mutate(input.requestId,{id,input},s=>{const row=invitation(s,id,input.version);row.status='revoked';row.version++;previewActivity(s,person,'invitation_revoked',id);return row}),
 retryInvitation:async(id,input)=>mutate(input.requestId,{id,input},s=>{const row=invitation(s,id,input.version);if(!['failed','uncertain'].includes(row.deliveryStatus))throw new PreviewError('Only failed or uncertain deliveries can be retried.');row.deliveryStatus=readPreview<'sent'|'failed'|'uncertain'>('studiostack.preview.delivery',()=> 'sent');row.attempts++;row.version++;previewActivity(s,person,'invitation_retried',id,{simulated:true});return row}),
 domains:async()=>{const s=admin();requirePreviewAdmin(person,s,true);return page(s.domains)},
 addDomain:async input=>mutate(input.requestId,input,s=>{const domain=input.domain.trim().toLowerCase(),own=memberFor(person,s).email?.split('@')[1];if(domain!==own)throw new PreviewError(`Use your preview email domain: ${own}.`);if(s.domains.some(d=>d.domain===domain))throw new PreviewError('This domain has already been added.');const row={domain,autoJoin:input.autoJoin,version:1,createdAt:new Date().toISOString()};s.domains.push(row);previewActivity(s,person,'domain_added',null,{domain});return row},true),
 updateDomain:async(domain,input)=>mutate(input.requestId,{domain,input},s=>{const row=s.domains.find(d=>d.domain===domain);if(!row)throw new PreviewError('Domain not found.');previewVersion(row,input.version);row.autoJoin=input.autoJoin;row.version++;previewActivity(s,person,'domain_updated',null,{domain});return row},true),
 removeDomain:async(domain,input)=>mutate(input.requestId,{domain,input},s=>{const row=s.domains.find(d=>d.domain===domain);if(!row)throw new PreviewError('Domain not found.');previewVersion(row,input.version);s.domains=s.domains.filter(d=>d!==row);previewActivity(s,person,'domain_removed',null,{domain});return {domain,removed:true as const}},true),
 joinCodes:async()=>page(admin().codes),
 createJoinCode:async input=>mutate(input.requestId,input,s=>{
  if(input.maxUses!==undefined&&input.maxUses!==null&&(!Number.isInteger(input.maxUses)||input.maxUses<1||input.maxUses>10000)||input.expiresInDays!==undefined&&input.expiresInDays!==null&&(!Number.isInteger(input.expiresInDays)||input.expiresInDays<1||input.expiresInDays>365))throw new PreviewError('Choose a valid maximum use count and expiry.');
  if(input.replaces){const old=s.codes.find(c=>c.id===input.replaces);if(!old||old.revokedAt)throw new PreviewError('The join code changed. Refresh first.');old.revokedAt=new Date().toISOString();old.version++}
  const now=new Date().toISOString(),code=crypto.randomUUID().replaceAll('-','').slice(0,10).toUpperCase(),row:JoinCode={id:crypto.randomUUID(),label:label(input.label,80),uses:0,maxUses:input.reusable?null:input.maxUses??null,expiresAt:input.reusable||!input.expiresInDays?null:new Date(Date.now()+input.expiresInDays*86400000).toISOString(),revokedAt:null,version:1,createdAt:now,code:`${code.slice(0,5)}-${code.slice(5)}`};s.codes.push(row);previewActivity(s,person,'join_code_created',row.id);return row
 }),
 revokeJoinCode:async(id,input)=>mutate(input.requestId,{id,input},s=>{const row=s.codes.find(c=>c.id===id);if(!row)throw new PreviewError('Code not found.');previewVersion(row,input.version);row.revokedAt=new Date().toISOString();row.version++;previewActivity(s,person,'join_code_revoked',id);return row}),
 accessRequests:async()=>page(admin().requests.filter(r=>r.status==='pending')),
 decideAccessRequest:async(id,decision,input)=>mutate(input.requestId,{id,decision,input},s=>{const row=s.requests.find(r=>r.id===id&&r.status==='pending');if(!row)throw new PreviewError('This request was already decided.');previewVersion(row,input.version);row.status=decision==='approve'?'approved':'denied';row.decidedAt=new Date().toISOString();row.version++;if(decision==='approve'&&s.members.some(m=>m.id===row.userId)){const m=s.members.find(m=>m.id===row.userId)!;m.status='active';m.role='member';m.version++}else if(decision==='approve')s.members.push({id:row.userId,email:row.email,displayName:row.displayName,role:'member',status:'active',version:1});previewActivity(s,person,'access_request_'+row.status,id);return row}),
 }
}
