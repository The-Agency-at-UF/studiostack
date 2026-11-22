import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import {createPreviewDatabaseApi} from './database'
import {readWorkspace,workspaceKey,availablePreviewPerson,previewIdentity} from './workspace'
import {writePreview} from './storage'
import {storePreviewFile,previewPhotoKey,previewAttachmentKey,readPreviewFile} from './media'
import {emptyBrief,type ProductionBrief} from '../types/production'
import {agencyCampus} from '../types/campus'
import {productionReadiness} from '../production/readiness'
const org='preview',campus={latitude:agencyCampus.latitude,longitude:agencyCampus.longitude,accuracy:25}
const owner=()=>createPreviewDatabaseApi('preview-admin'),author=()=>createPreviewDatabaseApi('preview-author'),guest=()=>createPreviewDatabaseApi('preview-new-member')
const id=()=>crypto.randomUUID()
const booking=(equipmentId:string)=>({name:'Example booking',startsAt:new Date(Date.now()+5*60000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),equipmentIds:[equipmentId],requestId:id()})
async function item(){return owner().createEquipment(org,{equipmentCode:id(),name:'Example test camera',category:'Camera & Accessories'})}
async function brief(){const data={...emptyBrief(),projectName:'Example local shoot',client:'Example client',managers:'Alex',deliveryDate:new Date(Date.now()+14*86400000).toISOString().slice(0,10),productionTypes:['Videography' as const],fields:{summary:'Example interview',objective:'Introduce the team',audience:'New team members',platform:'Internal',deliverables:'One video',shootEstimate:'Tomorrow',location:'Example studio',proposedStart:new Date(Date.now()+86400000).toISOString().slice(0,10),proposedEnd:new Date(Date.now()+86400000).toISOString().slice(0,10)}};return author().production(org).create(data,id())}
async function action(actor:ReturnType<typeof owner>,b:ProductionBrief,name:'submit'|'approve'|'deny',comment?:string){return actor.production(org).action(b.id,{action:name,comment,version:b.version,requestId:id()})}
beforeEach(()=>{localStorage.clear();vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Preview must not access the network'))})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('complete isolated preview workflows',()=>{
 it('persists inventory, bookings, colors and versions for a fresh client without network calls',async()=>{
  const row=await owner().createEquipment(org,{equipmentCode:id(),name:'Example SD card',category:'SD Cards',colorTag:'blue'})
  const r=await owner().createReservation(org,booking(row.id))
  expect((await createPreviewDatabaseApi().inventory(org)).items).toContainEqual(expect.objectContaining({id:row.id,colorTag:'blue'}))
  expect((await createPreviewDatabaseApi().reservations(org)).items).toContainEqual(expect.objectContaining({id:r.id}))
  expect(JSON.parse(localStorage.getItem(workspaceKey)!).reservations.some((b:{id:string})=>b.id===r.id)).toBe(true)
  await expect(owner().createReservation(org,{...booking(row.id),requestId:id()})).rejects.toThrow(/reserved/)
  expect(fetch).not.toHaveBeenCalled()
 })
 it('enforces campus checks, records returns and damage, and restores repaired items',async()=>{
  const i=await item(),r=await owner().createReservation(org,booking(i.id)),input={version:r.version,requestId:id(),location:campus,conditions:[{equipmentId:i.id,condition:'good' as const,notes:''}]}
  await expect(owner().equipment(org).checkout(r.id,{...input,location:{...campus,latitude:0}})).rejects.toThrow(/campus/)
  const out=await owner().equipment(org).checkout(r.id,input)
  const returned=await owner().equipment(org).return(r.id,{...input,version:out.version,requestId:id(),conditions:[{equipmentId:i.id,condition:'damaged',notes:'Example: damaged mount'}]})
  expect(returned.fulfillmentStatus).toBe('returned')
  const report=(await owner().reports(org).list()).items.find(r=>r.equipmentId===i.id)!
  expect(report).toMatchObject({severity:'high',status:'open'})
  expect((await owner().inventory(org)).items.find(r=>r.id===i.id)?.status).toBe('maintenance')
  const resolved=await owner().reports(org).update(report.id,{status:'resolved',resolution:'Example repair completed',restoreService:true,condition:'good',version:report.version,requestId:id()})
  expect((await owner().inventory(org)).items.find(r=>r.id===i.id)?.status).toBe('available')
  await owner().reports(org).update(report.id,{status:'open',resolution:'Example: repair needs another inspection',restoreService:false,version:resolved.version,requestId:id()})
  expect((await owner().inventory(org)).items.find(r=>r.id===i.id)?.status).toBe('maintenance')
  expect((await owner().equipment(org).activity(r.id)).items.map(e=>e.kind)).toEqual(expect.arrayContaining(['checked_out','returned']))
  expect(fetch).not.toHaveBeenCalled()
 })
 it('locks overdue members, lets owners bypass, clears the lock on return and hides member history',async()=>{
  const i=await item();await expect(author().createReservation(org,booking(i.id))).rejects.toThrow(/overdue/)
  expect(await owner().createReservation(org,booking(i.id))).toMatchObject({status:'confirmed'})
  await owner().equipment(org).return('preview-overdue',{version:1,requestId:id(),location:campus,conditions:[{equipmentId:'SD-RED',condition:'good',notes:''}]})
  expect((await author().reservations(org)).items.some(r=>r.id==='preview-overdue')).toBe(false)
  expect(await author().createReservation(org,booking((await item()).id))).toMatchObject({status:'confirmed'})
  expect((await owner().reservations(org)).items.some(r=>r.id==='preview-overdue')).toBe(true)
 })
 it('supports member changes and retains suspended records with real owner restrictions',async()=>{
  const api=owner().accounts(org),row=(await api.members()).items.find(m=>m.id==='preview-author')!
  await api.updateMember(row.id,{version:row.version,role:'member',status:'suspended',requestId:id()})
  expect((await api.members()).items.find(m=>m.id===row.id)).toBeUndefined();expect(JSON.parse(localStorage.getItem(workspaceKey)!).members.find((m:{id:string})=>m.id===row.id).status).toBe('suspended')
  await expect(author().inventory(org)).rejects.toThrow(/suspended/)
  await expect(api.updateMember('preview-admin',{version:1,role:'member',status:'active',requestId:id()})).rejects.toThrow(/administrator|owner/)
  expect((await api.activity()).items.some(e=>e.kind==='member_updated')).toBe(true)
 })
 it('simulates invitation failure/retry and allows the invited new teammate to accept',async()=>{
  writePreview('studiostack.preview.delivery','failed')
  const api=owner().accounts(org),invite=await api.invite({email:'new.teammate@preview.example',role:'member',requestId:id()})
  expect(invite.deliveryStatus).toBe('failed')
  writePreview('studiostack.preview.delivery','sent')
  expect(await api.retryInvitation(invite.id,{version:invite.version,requestId:id()})).toMatchObject({deliveryStatus:'sent',attempts:2})
  expect((await guest().onboarding()).invitations).toHaveLength(1)
  await guest().acceptInvitation(invite.id,org)
  expect((await guest().organizations()).items).toHaveLength(1)
  expect(fetch).not.toHaveBeenCalled()
 })
 it.each(['code','domain','request'] as const)('allows guest onboarding through %s',async method=>{
  const api=owner().accounts(org)
  if(method==='code'){const code=await api.createJoinCode({label:'Example code',maxUses:1,expiresInDays:1,requestId:id()});await guest().joinByCode(code.code!);await expect(guest().joinByCode(code.code!)).rejects.toThrow()}
  if(method==='domain'){await api.addDomain({domain:'preview.example',autoJoin:true,requestId:id()});await guest().joinByDomain(org)}
  if(method==='request'){const r=(await api.accessRequests()).items[0];await api.decideAccessRequest(r.id,'approve',{version:r.version,requestId:id()})}
  expect((await guest().organizations()).items[0]).toMatchObject({id:org,role:'member'})
 })
 it('stores real attachment bytes and logo files locally and returns download URLs',async()=>{
  vi.stubGlobal('indexedDB',undefined);vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:local-preview-test'),revokeObjectURL:vi.fn()})
  let b=await brief();const file=new File(['%PDF-1.7\nExample creative brief'],'example.pdf',{type:'application/pdf'}),attachmentId=id()
  await author().production(org).attach(b.id,{id:attachmentId,name:file.name,contentType:file.type,size:file.size,category:'creative_brief'})
  await storePreviewFile(previewAttachmentKey(b.id,attachmentId),file)
  b=await author().production(org).complete(b.id,attachmentId)
  expect(b.attachments).toContainEqual(expect.objectContaining({status:'ready',category:'creative_brief'}))
  expect(await (await readPreviewFile(previewAttachmentKey(b.id,attachmentId))).text()).toContain('Example creative brief')
  expect((await author().production(org).download(b.id,attachmentId)).url).toMatch(/^blob:/)
  const image=new File(['example-jpeg'],'example.jpg',{type:'image/jpeg'}),photo=await owner().createPhotoUpload({organizationId:org,contentType:'image/jpeg',size:image.size,requestId:id()})
  await storePreviewFile(previewPhotoKey(photo.photoId),image);await owner().completePhoto(org,photo.photoId)
  const c=await owner().production(org).createClient('Example logo client');await owner().production(org).updateClient(c.id,{name:c.name,version:c.version,deleted:false,logoPhotoId:photo.photoId})
  expect((await createPreviewDatabaseApi().production(org).clientLogo(c.id)).url).toMatch(/^blob:/)
  expect(fetch).not.toHaveBeenCalled()
 })
 it('tracks simulated brief decisions and retry results while sharing real alerts and history permissions',async()=>{
  let b=await brief();b=await action(author(),b,'submit')
  expect(productionReadiness(b).flagged).toBe(true)
  expect((await owner().alerts(org).list()).items.some(a=>a.kind==='production_readiness'&&a.targetPath.endsWith(b.id))).toBe(true)
  writePreview('studiostack.preview.delivery','failed');b=await action(owner(),b,'deny','Example: please include location permission.')
  const deliveries=(await owner().production(org).deliveries()).items.filter(d=>d.briefId===b.id);expect(deliveries).toHaveLength(2);expect(deliveries[0].status).toBe('failed')
  writePreview('studiostack.preview.delivery','sent');await owner().production(org).retry(deliveries[0].id)
  expect((await owner().production(org).deliveries()).items.find(d=>d.id===deliveries[0].id)).toMatchObject({status:'sent',attempts:2})
  expect((await author().production(org).get(b.id)).events).toEqual([expect.objectContaining({kind:'denied',snapshot:null})])
  expect(fetch).not.toHaveBeenCalled()
 })
 it('removes suspended crew from all projected brief reads and readiness',async()=>{
  let b=await action(owner(),await action(author(),await brief(),'submit'),'approve')
  b=await owner().production(org).assign(b.id,{version:b.version,requestId:id(),assignments:[{userId:'preview-reviewer',role:'Videographer'}]})
  expect(productionReadiness(b).missing).not.toContain('Confirmed crew members')
  const member=readWorkspace().members.find(m=>m.id==='preview-reviewer')!
  await owner().accounts(org).updateMember(member.id,{role:member.role,status:'suspended',version:member.version,requestId:id()})
  expect((await owner().production(org).get(b.id)).crew).toEqual([])
  expect((await owner().production(org).list()).items.find(r=>r.id===b.id)?.crew).toEqual([])
 })
})

it('restores removed people only by invitation and recovers after deleting a preview identity',async()=>{
 const accounts=owner().accounts(org),alex=(await accounts.members()).items.find(m=>m.id==='preview-author')!;
 await accounts.updateMember(alex.id,{role:'member',status:'suspended',version:alex.version,requestId:id()});
 expect(availablePreviewPerson(alex.id)).toBe('preview-admin');
 const invite=await accounts.invite({email:alex.email!,role:'member',requestId:id()});
 expect(previewIdentity(alex.id).status).toBe('suspended');expect((await author().organizations()).items).toEqual([]);
 await expect(author().joinByCode('INVALID')).rejects.toThrow(/invitation/);await expect(author().joinByDomain(org)).rejects.toThrow(/invitation/);
 await author().acceptInvitation(invite.id,org);expect((await author().organizations()).items).toHaveLength(1);
 await author().deleteAccount();expect(availablePreviewPerson(alex.id)).toBe('preview-admin');expect((await createPreviewDatabaseApi(availablePreviewPerson(alex.id)).organizations()).items).toHaveLength(1);
})

it('LOGIC-031: a failed preview write leaves both the decision and crew alerts unchanged',async()=>{
 let b=await action(owner(),await action(author(),await brief(),'submit'),'approve')
 const production=owner().production(org)
 b=await production.assign(b.id,{version:b.version,requestId:id(),assignments:[{userId:'preview-reviewer',role:'Videographer'}]})
 const command={action:'request_changes' as const,comment:'Review crew plan',version:b.version,requestId:id()}
 const storage=globalThis.localStorage
 vi.stubGlobal('localStorage',{
  getItem:storage.getItem.bind(storage),
  setItem(key:string,value:string){
   if(key===workspaceKey)throw new DOMException('Fixture storage full','QuotaExceededError')
   storage.setItem(key,value)
  },
 })
 await expect(production.action(b.id,command)).rejects.toThrow()
 vi.unstubAllGlobals()
 expect(await production.get(b.id)).toMatchObject({status:'approved',version:b.version})
 const changed=await production.action(b.id,command)
 expect(changed).toMatchObject({status:'changes_requested',version:b.version+1})
 await expect(production.action(b.id,command)).resolves.toMatchObject({version:changed.version})
 expect(readWorkspace().alerts.filter(a=>a.dedupeKey===`schedule:${b.id}:${changed.version}`)).toHaveLength(1)
})
