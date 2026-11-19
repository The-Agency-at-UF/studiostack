import {PreviewError} from './errors'
import type {ApiBugReport,FeedbackKind} from '../types/database-api'
import type {ManagedMember,OrganizationSettings,OrganizationInvitation,OrganizationActivity,JoinCode,WorkspaceDomain,PendingAccessRequest} from '../types/accounts'
import type {EquipmentRecord,EquipmentReservation,EquipmentReport,EquipmentEvent} from '../types/equipment'
import type {AppAlert,AlertPreferences} from '../types/alerts'
import {readPreview,writePreview} from './storage'
import {previewPeople} from './people'
export const workspaceKey='studiostack-workspace-preview-v2'
export interface PreviewWorkspace {
 onboarded?:Record<string,string>; settings:Omit<OrganizationSettings,'role'>; members:ManagedMember[]; invitations:OrganizationInvitation[]; activity:OrganizationActivity[];codes:JoinCode[];domains:WorkspaceDomain[];requests:PendingAccessRequest[];
 inventory:EquipmentRecord[];reservations:EquipmentReservation[];reports:EquipmentReport[];events:EquipmentEvent[];alerts:(AppAlert&{recipientId:string;dedupeKey:string})[];preferences:Record<string,AlertPreferences>;
 photos:Record<string,{contentType:string;size:number;ready:boolean}>;feedback:(ApiBugReport&{kind:FeedbackKind;userId:string})[];receipts:Record<string,{fingerprint:string;result:unknown}>
}
function initial():PreviewWorkspace {
 const now=new Date().toISOString(),at=(hours:number)=>new Date(Date.now()+hours*3600000).toISOString()
 const item=(id:string,name:string,category:EquipmentRecord['category'],colorTag:EquipmentRecord['colorTag']=null):EquipmentRecord=>({id,equipmentCode:id,name,category,colorTag,status:'available',condition:'good',version:1,checkedOut:false,photoId:null,createdAt:now})
 const reservation=(id:string,name:string,userId:string,equipmentIds:string[],startsAt:string,endsAt:string,fulfillmentStatus:EquipmentReservation['fulfillmentStatus']='reserved'):EquipmentReservation=>({id,name,userId,equipmentIds,startsAt,endsAt,fulfillmentStatus,status:'confirmed',version:1,createdAt:now,checkedOutAt:fulfillmentStatus==='reserved'?null:startsAt,returnedAt:fulfillmentStatus==='returned'?endsAt:null})
 return {settings:{id:'preview',name:'StudioStack · Local preview',slug:'preview',reservationDays:7,location:'Gainesville, FL',logoPhotoId:null,version:1},members:[...previewPeople.map(p=>({...p,email:p.id.replace('preview-','')+'@preview.example',role:p.id==='preview-admin'?'owner' as const:'member' as const,status:'active' as const,version:1})),{id:'preview-new-member',email:'new.teammate@preview.example',displayName:'Example new teammate',role:'member',status:'invited',version:1}],invitations:[],activity:[],codes:[],domains:[],requests:[{id:'preview-access-request',userId:'preview-new-member',email:'new.teammate@preview.example',displayName:'Example teammate',message:'I would like to help with the next studio shoot.',status:'pending',version:1,createdAt:now,decidedAt:null}],
 inventory:typeof window==='undefined'?[]:[item('CAM-DEMO','Example interview camera','Camera & Accessories'),item('LGT-DEMO','Example key light','Lights'),item('TRI-DEMO','Example tripod','Tripods / Stands'),item('SD-RED','Example red SD card','SD Cards','red'),item('SD-BLUE','Example blue SD card','SD Cards','blue'),item('PROP-DEMO','Example studio backdrop','Props'),{...item('MIC-DEMO','Example damaged microphone','Audio'),condition:'damaged',status:'maintenance'}],
 reservations:typeof window==='undefined'?[]:[reservation('preview-pickup','Example: studio equipment pickup','preview-admin',['CAM-DEMO','LGT-DEMO'],at(0.08),at(3)),reservation('preview-overdue','Example: overdue SD card','preview-author',['SD-RED'],at(-4),at(-1),'checked_out'),reservation('preview-returned','Example: completed equipment return','preview-admin',['TRI-DEMO'],at(-48),at(-46),'returned')],
 reports:typeof window==='undefined'?[]:[{id:'preview-report',equipmentId:'MIC-DEMO',reservationId:null,reportedBy:'preview-author',title:'Example: microphone cable damage',description:'Example report: inspect the damaged connector before returning the microphone to service.',severity:'high',status:'open',resolution:'',resolvedBy:null,resolvedAt:null,version:1,createdAt:now,updatedAt:now}],events:[],alerts:[],preferences:{},photos:{},feedback:[],receipts:{}}
}
export function readWorkspace(){const state=readPreview(workspaceKey,()=>{const state=initial();saveWorkspace(state);return state});if(!state.members.some(m=>m.id==='preview-new-member')){state.members.push({id:'preview-new-member',email:'new.teammate@preview.example',displayName:'Example new teammate',role:'member',status:'invited',version:1});saveWorkspace(state)}return state}
export function previewIdentity(person:string,state=readWorkspace()){const row=state.members.find(m=>m.id===person&&(m.status!=='suspended'||state.invitations.some(i=>i.email===m.email&&i.status==='pending'&&Date.parse(i.expiresAt)>Date.now())));if(!row)throw new PreviewError('Preview account unavailable. Switch to an active account.');return row}
export function saveWorkspace(state:PreviewWorkspace){writePreview(workspaceKey,state)}
export function memberFor(person:string,state=readWorkspace()){
 const member=state.members.find(m=>m.id===person&&m.status==='active')
 if(!member)throw new PreviewError('This preview membership is suspended or unavailable. Switch to an active preview account.')
 return member
}
export function previewAdmin(person:string,state=readWorkspace()){return ['owner','admin'].includes(memberFor(person,state).role)}
export function requirePreviewAdmin(person:string,state=readWorkspace(),owner=false){const m=memberFor(person,state);if(owner?m.role!=='owner':!previewAdmin(person,state))throw new PreviewError('This preview account cannot manage that setting.')}
export function previewActivity(s:PreviewWorkspace,person:string,kind:string,targetId:string|null,details:Record<string,unknown>={}){s.activity.push({id:crypto.randomUUID(),actorName:memberFor(person,s).displayName??'Preview teammate',kind,targetId,details,createdAt:new Date().toISOString()})}
export function addPreviewAlert(s:PreviewWorkspace,recipientId:string,kind:AppAlert['kind'],title:string,message:string,targetPath:string,dedupeKey:string){if(s.alerts.some(a=>a.recipientId===recipientId&&a.dedupeKey===dedupeKey))return;s.alerts.push({id:crypto.randomUUID(),recipientId,dedupeKey,kind,title,message,targetPath,createdAt:new Date().toISOString(),readAt:null,emailStatus:s.preferences[recipientId]?.equipmentEmail?readPreview<'sent'|'failed'|'uncertain'>('studiostack.preview.delivery',()=> 'sent'):'skipped'})}
let writes:Promise<unknown>=Promise.resolve()
export function mutateWorkspace<T>(fn:(state:PreviewWorkspace)=>T):Promise<T>{const task=writes.catch(()=>{}).then(()=>{const s=readWorkspace(),result=fn(s);saveWorkspace(s);return structuredClone(result)});writes=task;return task}
export function previewVersion(row:{version:number},version:number){if(row.version!==version)throw new PreviewError('This record changed. Refresh before saving.')}
export function previewReceipt<T>(s:PreviewWorkspace,person:string,requestId:string,value:unknown,run:()=>T):T {const key=`${person}:${requestId}`,fingerprint=JSON.stringify(value),previous=s.receipts[key];if(previous){if(previous.fingerprint!==fingerprint)throw new PreviewError('Request ID already used for different content.');return structuredClone(previous.result) as T}const result=run();s.receipts[key]={fingerprint,result:structuredClone(result)};return result}

/** A stale/removed local identity must not trap the preview before its account selector renders. */
export function availablePreviewPerson(saved:string){if(typeof window==='undefined')return 'preview-admin';const state=readWorkspace();try{return previewIdentity(saved,state).id}catch{return state.members.find(m=>m.id==='preview-admin'&&m.status==='active')?.id??state.members.find(m=>m.status==='active')?.id??'preview-new-member'}}
