import {readPreview} from '../preview/storage'
import {memberFor,previewAdmin,readWorkspace,saveWorkspace,addPreviewAlert,previewReceipt} from '../preview/workspace'
import {previewFileUrl,previewPhotoKey,previewAttachmentKey,readPreviewFile} from '../preview/media'
import {attachmentCategories,type Delivery} from '../types/production'
import {softHoldsFor} from './readiness'
import { briefSections, dateErrors, emptyBrief, normalizedBrief, submissionErrors, type ClientAccount, type ProductionIdea, type BriefCommand, type BriefData, type ProductionAccess, type ProductionBrief, type ProductionSettings } from '../types/production'
import type { ProductionClient } from '../api/production'
export {previewPeople} from '../preview/people'
export type PreviewProductionState = { demoVersion?:number; briefs: ProductionBrief[]; settings: ProductionSettings; clients?:ClientAccount[]; ideas?:ProductionIdea[]; deliveries?:(Delivery&{recipientId:string})[] }
type State = PreviewProductionState
const key = 'studiostack-production-preview-v1'
function initial(): State {
  const data = emptyBrief(), start = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10), delivery = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10)
  Object.assign(data, { projectName: 'Campus stories', client: 'Example client', managers: 'Alex', supervisor: 'Jordan', deliveryDate: delivery, productionTypes: ['Videography', 'Video Editing'], fields: { summary: 'A short interview film introducing the people behind the project.', objective: 'Help students discover the program.', audience: 'University students', platform: 'Instagram and YouTube', deliverables: 'One 60-second film and two vertical cutdowns.', concept: 'Natural interviews with observational B-roll.', shootEstimate: 'Next week', proposedStart: start, proposedEnd: start, location: 'Campus studio', editingDirection: 'Conversational pacing with captions.', formats: 'Horizontal and vertical' } })
  const now = new Date().toISOString()
  return { clients:[{id:'preview-client',name:'Example client',version:1,createdBy:'preview-admin',deletedAt:null}],settings: { version: 1, reviewerIds: ['preview-reviewer'], executiveIds: ['preview-executive'], approvalConfirmsDates: true }, briefs: [{ id: 'preview-brief', organizationId: 'preview', ownerId: 'preview-author', ownerName: 'Alex · Client Services', data, status: 'submitted', version: 1, submission: 1, shootStartsAt: null, shootEndsAt: null, createdAt: now, updatedAt: now, attachments: [], events: [{ id: 'preview-event', actorId: 'preview-author', actorName: 'Alex · Client Services', kind: 'submitted', comment: '', section: '', version: 1, createdAt: now, snapshot: structuredClone(data) }] }] }
}
export function readPreviewProductionState(workspace=readWorkspace()): State {const state=workspace.production??readPreview(key,initial);for(const c of state.clients??[]){c.createdBy??='preview-admin';c.deletedAt??=c.archivedAt??null}if(state.demoVersion!==2){const sample=structuredClone(initial().briefs[0]),date=new Date(Date.now()+86400000).toISOString().slice(0,10);sample.id='preview-readiness-example';sample.data.projectName='Example: shoot readiness check';sample.data.fields.proposedStart=date;sample.data.fields.proposedEnd=date;sample.events=[];if(!state.briefs.some(b=>b.id===sample.id))state.briefs.push(sample);state.demoVersion=2}return state}
export function createPreviewProductionClient(person: string): ProductionClient {
  const load=readPreviewProductionState
  const access = (state: State): ProductionAccess => ({ userId: person, canReview: previewAdmin(person)||state.settings.reviewerIds.includes(person), canAdminister: previewAdmin(person), isExecutive: state.settings.executiveIds.includes(person), notificationsConfigured: true })
  const readable = (b: ProductionBrief, state: State) => person === b.ownerId || access(state).canAdminister || b.status !== 'draft'
  function find(state: State, id: string) { memberFor(person);const brief = state.briefs.find(b => b.id === id); if (!brief || !readable(brief, state)) throw new Error('Brief not found'); return brief }
  const persist = (state: State, workspace=readWorkspace()) => { workspace.production=state;saveWorkspace(workspace) }
  const append = (brief:ProductionBrief,kind:string,comment='',section='',snapshot:BriefData|null=null,state?:State) => {
    brief.updatedAt=new Date().toISOString();const actor=memberFor(person),event={id:crypto.randomUUID(),actorId:person,actorName:actor.displayName??'Preview teammate',kind,comment,section,snapshot,attachments:snapshot?structuredClone(brief.attachments.filter(a=>a.status==='ready')):[],shootStartsAt:brief.shootStartsAt,shootEndsAt:brief.shootEndsAt,version:brief.version,createdAt:brief.updatedAt};brief.events.push(event)
    if(state&&['approved','denied','changes_requested','scheduled','withdrawn'].includes(kind)){
      const outcome=readPreview<'sent'|'failed'|'uncertain'>('studiostack.preview.delivery',()=> 'sent'),workspace=readWorkspace()
      for(const recipientId of new Set([brief.ownerId,...state.settings.executiveIds]))if(workspace.members.some(m=>m.id===recipientId&&m.status==='active')){
        (state.deliveries??=[]).push({id:crypto.randomUUID(),briefId:brief.id,eventId:event.id,recipientId,status:outcome,attempts:1,createdAt:brief.updatedAt,sentAt:outcome==='sent'?brief.updatedAt:null})
      }
    }
  }
  const detail=(b:ProductionBrief,s:State)=>{const copy=structuredClone(b),a=access(s),active=new Set(readWorkspace().members.filter(m=>m.status==='active').map(m=>m.id));copy.crew=copy.crew?.filter(c=>active.has(c.userId));if(!a.canReview&&!a.canAdminister&&!a.isExecutive)copy.events=copy.events.filter(e=>['approved','denied','changes_requested'].includes(e.kind)).map(e=>({...e,snapshot:null,attachments:[]}));return copy}
  const canEdit=(b:ProductionBrief)=>(b.ownerId===person||access(load()).canAdminister)&&['draft','changes_requested'].includes(b.status)

  return {
    people:async()=>{const s=load();if(!access(s).canReview)throw new Error('Production leadership required');return {items:readWorkspace().members.filter(m=>m.status==='active'),nextCursor:null}},
    ideas:async()=>({items:structuredClone(load().ideas??[]),nextCursor:null}),
    createIdea:async input=>{const s=load(),now=new Date().toISOString();const old=s.ideas?.find(i=>i.id===input.id);if(old)return structuredClone(old);const idea:ProductionIdea={...input,authorId:person,authorName:memberFor(person).displayName??'Preview teammate',status:'idea',version:1,createdAt:now,updatedAt:now};s.ideas=[...(s.ideas??[]),idea];persist(s);return structuredClone(idea)},
    updateIdea:async(id,input)=>{const s=load(),idea=s.ideas?.find(i=>i.id===id);if(!idea)throw new Error('Idea not found');if(idea.version!==input.version)throw new Error('Idea changed');if(!access(s).canReview&&(idea.authorId!==person||idea.status==='selected'||input.status==='selected'))throw new Error('Leadership selects pitches');Object.assign(idea,input,{version:idea.version+1,updatedAt:new Date().toISOString()});persist(s);return structuredClone(idea)},
    clients:async()=>{memberFor(person);return {items:structuredClone(load().clients??[]),nextCursor:null}},
    createClient:async name=>{const s=load();if(!access(s).canReview)throw new Error('Leadership required');const c={id:crypto.randomUUID(),name,version:1,createdBy:person,deletedAt:null};s.clients=[...(s.clients??[]),c];persist(s);return c},
    updateClient:async(id,input)=>{const s=load(),c=s.clients?.find(c=>c.id===id);if(!c)throw new Error('Client unavailable');const changesStatus=input.deleted!==Boolean(c.deletedAt);if(changesStatus&&!(access(s).canAdminister||c.createdBy===person)||!access(s).canReview&&(!changesStatus||input.name!==c.name))throw new Error('Client unavailable');if(input.version!==c.version)throw new Error('Client changed');Object.assign(c,{name:input.name,deletedAt:input.deleted?new Date().toISOString():null,version:c.version+1,...(input.logoPhotoId!==undefined?{logoPhotoId:input.logoPhotoId}:{})});if(c.logoPhotoId&&!readWorkspace().photos[c.logoPhotoId]?.ready)throw new Error('Upload a ready logo in this preview first.');persist(s);return structuredClone(c)},
    clientLogo:async id=>{memberFor(person);const c=load().clients?.find(c=>c.id===id);if(!c?.logoPhotoId)throw new Error('Client logo not found');return previewFileUrl(previewPhotoKey(c.logoPhotoId))},
    assign:async(id,input)=>{
      const workspace=readWorkspace(),s=load(workspace),b=find(s,id)
      const replay=Boolean(workspace.receipts[`${person}:${input.requestId}`])
      const result=previewReceipt(workspace,person,input.requestId,{operation:'productionAssignment',id,input},()=>{
      if(!access(s).canReview||b.status!=='approved'||!b.shootStartsAt&&(b.data.productionTypes.some(t=>['Photography','Videography'].includes(t))||!b.data.crewRequests?.length))throw new Error('Approve and schedule the shoot first.');if(input.version!==b.version)throw new Error('Brief changed. Refresh before saving.')
      const requests=b.data.crewRequests??[],crew=input.assignments
      if(new Set(crew.map(a=>a.userId)).size!==crew.length||new Set(crew.filter(a=>a.crewRequestId).map(a=>a.crewRequestId)).size!==crew.filter(a=>a.crewRequestId).length)throw new Error('Choose each crew member and position once.')
      for(const a of crew){memberFor(a.userId);const r=requests.find(r=>r.id===a.crewRequestId);if(requests.length&&(!r||r.role!==a.role))throw new Error('Fill a current requested position.');const start=r?.startsAt??b.shootStartsAt!,end=r?.endsAt??b.shootEndsAt!;for(const other of s.briefs.filter(other=>other.id!==b.id&&other.status==='approved'))for(const assigned of other.crew??[]){const shift=other.data.crewRequests?.find(r=>r.id===assigned.crewRequestId);if(assigned.userId===a.userId&&Date.parse(shift?.startsAt??other.shootStartsAt!)<Date.parse(end)&&Date.parse(shift?.endsAt??other.shootEndsAt!)>Date.parse(start))throw new Error('A crew member is assigned to an overlapping shift.')}}
      const previous=b.crew??[];b.crew=crew.map(a=>({...a,name:memberFor(a.userId).displayName??'Preview teammate'}));b.version++;append(b,'crew_assigned')
      for(const recipient of new Set([...previous,...b.crew].map(a=>a.userId)))if(workspace.members.some(m=>m.id===recipient&&m.status==='active'))addPreviewAlert(workspace,recipient,'production_assignment','Production crew updated',`Review your assignment for ${b.data.projectName}.`,`/production/?brief=${b.id}`,`crew:${b.id}:${b.version}`)
      return detail(b,s)
      })
      if(!replay)persist(s,workspace)
      return result
    },

    access: async () => {memberFor(person);return access(load())}, settings: async () => { const s = load(); if (!access(s).canAdminister) throw new Error('Administrator required'); return structuredClone(s.settings) },
    saveSettings: async input => { const state = load(); if (!access(state).canAdminister) throw new Error('Administrator required'); for(const id of [...input.reviewerIds,...input.executiveIds])memberFor(id);if (input.version !== state.settings.version) throw new Error('Settings changed. Reload first.'); state.settings = { ...input, version: input.version + 1 }; persist(state); return structuredClone(state.settings) },
    list: async () => { const s = load(); return { items: s.briefs.filter(b => readable(b,s)).map(b=>({...detail(b,s),events:[],attachments:[]})), nextCursor: null } },
    get: async id => {const s=load();return detail(find(s,id),s)},
    create: async (data, requestId) => { const state = load(); const found = state.briefs.find(b => b.id === requestId); if (found) return structuredClone(found); const now = new Date().toISOString(); const brief: ProductionBrief = { id: requestId, organizationId: 'preview', ownerId: person, ownerName: memberFor(person).displayName??'Preview teammate', data: normalizedBrief(data), status: 'draft', version: 1, submission: 0, shootStartsAt: null, shootEndsAt: null, createdAt: now, updatedAt: now, events: [], attachments: [] }; append(brief, 'created'); state.briefs.push(brief); persist(state); return detail(brief,state) },
    save: async (id, data, expected) => { const state = load(), b = find(state,id); if (!canEdit(b)) throw new Error('This brief cannot be edited'); if (b.version !== expected) throw new Error('This brief changed. Reload first.'); const clean = normalizedBrief(data), invalid = dateErrors(clean, true)[0]; if (invalid) throw new Error(invalid.message); b.data = clean; b.version++; append(b,'saved'); persist(state); return detail(b,state) },
    remove: async (id,version) => { const state = load(), b = find(state,id); if (!(b.ownerId===person||access(state).canAdminister)||!['draft','denied','withdrawn'].includes(b.status)) throw new Error('Only the author or an administrator can delete a draft, denied or withdrawn brief'); if(b.version!==version)throw new Error('Brief changed. Refresh before deleting'); state.briefs = state.briefs.filter(x => x.id !== id); persist(state); return { id } },
    action: async (id, c: BriefCommand) => {
      const workspace=readWorkspace(),state = load(workspace), b = find(state,id), a = access(state), own = b.ownerId === person
      const replay=Boolean(workspace.receipts[`${person}:${c.requestId}`])
      const result=previewReceipt(workspace,person,c.requestId,{operation:'productionAction',id,command:c},()=>{
      if (b.version !== c.version) throw new Error('This brief changed. Reload first.')
      const oldStart=b.shootStartsAt,oldEnd=b.shootEndsAt,previousCrewIds=(b.crew??[]).map(a=>a.userId)
      let kind: string = c.action
      if (c.action === 'submit') { if (!own || !['draft','changes_requested'].includes(b.status)) throw new Error('Only the author can submit a draft'); const errors = submissionErrors(b.data); if (errors.length) throw new Error(`Complete: ${errors.join(', ')}`); if(b.attachments.some(a=>a.status==='pending'))throw new Error('Finish or remove pending uploads before submitting.');b.status = 'submitted'; b.submission++ }
      else if (['approve','request_changes','deny','schedule'].includes(c.action)) {
        if (!a.canReview) throw new Error('Production leadership access required')
        if (c.action === 'schedule' ? !['submitted','approved'].includes(b.status) : !['submitted', ...(c.action === 'request_changes' ? ['approved'] : [])].includes(b.status)) throw new Error('Action unavailable for this status')
        if (['request_changes','deny'].includes(c.action) && !c.comment?.trim()) throw new Error('A reason is required')
        if (c.action === 'approve' || c.action === 'schedule') {
          if ((c.action==='schedule'||c.shootStartsAt||c.softHoldId||!b.shootStartsAt&&softHoldsFor(b).length===1)&&b.data.productionTypes.some(t => ['Photography','Videography'].includes(t))) {
            const holds=softHoldsFor(b),hold=c.softHoldId?holds.find(h=>h.id===c.softHoldId):holds.length===1?holds[0]:undefined
            const start = c.shootStartsAt ?? hold?.startsAt, end = c.shootEndsAt ?? hold?.endsAt
            if (!start || !end || Date.parse(end)<=Date.parse(start) || Date.parse(end)-Date.parse(start)>31*86400000) throw new Error('Choose a shoot window of up to 31 days')
            if (b.data.deliveryDate && Date.parse(end) > Date.parse(b.data.deliveryDate) + 86400_000) throw new Error('Shoot must finish by delivery')
            b.shootStartsAt = start; b.shootEndsAt = end
          }
          if(c.action==='approve')b.status = 'approved'; kind = c.action === 'approve' ? 'approved' : 'scheduled'
        }
        if (c.action === 'request_changes') { b.status = 'changes_requested'; b.shootStartsAt = null; b.shootEndsAt = null; kind = 'changes_requested' }
        if (c.action === 'deny') { b.status = 'denied';b.shootStartsAt=null;b.shootEndsAt=null; kind = 'denied' }
      } else if(c.action==='propose_dates'){if(!own&&!a.canReview||['denied','withdrawn'].includes(b.status))throw new Error('Cannot propose dates');b.softHolds=c.softHolds;kind='dates_proposed'
      } else if (c.action === 'withdraw') { if ((!own && !a.canReview) || !['submitted','approved','changes_requested'].includes(b.status)) throw new Error('Cannot withdraw this brief'); b.status = 'withdrawn'; b.shootStartsAt = null; b.shootEndsAt = null; kind = 'withdrawn' }
      else if (c.action === 'reopen') { if (!own || !['denied','withdrawn'].includes(b.status)) throw new Error('Cannot reopen this brief'); b.status = 'draft'; kind = 'reopened' }
      else if (c.action === 'comment') { if ((!own && !a.canReview) || !c.comment?.trim() || ['denied','withdrawn'].includes(b.status)) throw new Error('Cannot add this comment'); if (c.section && !briefSections.some(s=>s.title === c.section)) throw new Error('Unknown section'); kind = 'commented' }
      if(oldStart&&b.shootStartsAt&&(new Date(oldStart).getTime()!==new Date(b.shootStartsAt).getTime()||new Date(oldEnd!).getTime()!==new Date(b.shootEndsAt!).getTime())){const delta=new Date(b.shootStartsAt).getTime()-new Date(oldStart).getTime();b.crew=[];if(b.data.crewRequests)b.data.crewRequests=b.data.crewRequests.map(r=>r.role==='Video Editor'?r:{...r,startsAt:new Date(Date.parse(r.startsAt)+delta).toISOString(),endsAt:new Date(Date.parse(r.endsAt)+delta).toISOString()})}
      if(['request_changes','withdraw','deny'].includes(c.action))b.crew=[]
      b.version++; append(b,kind,c.comment,c.section,['submit','approve','request_changes','deny','schedule'].includes(c.action) ? structuredClone(b.data) : null,state); if(['approved','scheduled','changes_requested','withdrawn','denied'].includes(kind)){for(const recipientId of new Set([...previousCrewIds,...(b.crew??[]).map(a=>a.userId)]))if(workspace.members.some(m=>m.id===recipientId&&m.status==='active'))addPreviewAlert(workspace,recipientId,'production_assignment','Production schedule updated',`Review the latest schedule and crew confirmation for ${b.data.projectName}.`,`/production/?brief=${b.id}`,`schedule:${b.id}:${b.version}`)}
      return detail(b,state)
      })
      if(!replay)persist(state,workspace)
      return result
    },
    deliveries:async()=>{const s=load(),a=access(s);if(!a.canReview&&!a.canAdminister&&!a.isExecutive)throw new Error('Leadership required');return {items:structuredClone(s.deliveries??[]),nextCursor:null}},
    retry:async id=>{const s=load();if(!access(s).canAdminister)throw new Error('Administrator required');const row=s.deliveries?.find(d=>d.id===id);if(!row||!['failed','uncertain'].includes(row.status))throw new Error('Only failed or uncertain deliveries can be retried.');row.status=readPreview<'sent'|'failed'|'uncertain'>('studiostack.preview.delivery',()=> 'sent');row.attempts++;row.sentAt=row.status==='sent'?new Date().toISOString():null;persist(s);return {id}},
    attach:async(briefId,input)=>{
      const s=load(),b=find(s,briefId);if(!canEdit(b))throw new Error('Only the author can upload while editing.');const category=input.category??'reference';if(!Object.hasOwn(attachmentCategories,category)||!['application/pdf','image/jpeg','image/png','image/webp'].includes(input.contentType)||input.size<1||input.size>20*1024*1024||category==='creative_brief'&&input.contentType!=='application/pdf'||category==='creative_assets'&&!['image/png','image/jpeg'].includes(input.contentType))throw new Error('Choose a supported file and category, up to 20 MiB.');const old=b.attachments.find(a=>a.id===input.id);if(old&&(old.name!==input.name||old.contentType!==input.contentType||old.size!==input.size||old.status!=='pending'))throw new Error('Attachment ID already used.');if(!old){if(b.attachments.length>=20)throw new Error('Up to 20 files per brief.');b.attachments.push({...input,category,status:'pending',uploadedBy:person});persist(s)}return {id:input.id,url:'local-preview://attachment/'+input.id,fields:{}}
    },
    complete:async(briefId,id)=>{const file=await readPreviewFile(previewAttachmentKey(briefId,id)),s=load(),b=find(s,briefId),a=b.attachments.find(a=>a.id===id);if(!a||!canEdit(b)||a.uploadedBy!==person)throw new Error('Attachment unavailable.');if(file.size!==a.size||file.type!==a.contentType)throw new Error('The saved file does not match the upload.');if(a.status!=='ready'){a.status='ready';b.version++;append(b,'attachment_added',a.name);persist(s)}return detail(b,s)},
    discard:async(briefId,id)=>{const s=load(),b=find(s,briefId);if(!canEdit(b))throw new Error('Only the author can remove files while editing.');if(!b.attachments.some(a=>a.id===id))return {id};b.attachments=b.attachments.filter(a=>a.id!==id);b.version++;append(b,'attachment_removed');persist(s);return {id}},
    download:async(briefId,id)=>{const s=load(),b=find(s,briefId),a=access(s);const file=b.attachments.find(f=>f.id===id)??((a.canReview||a.canAdminister||a.isExecutive)?b.events.flatMap(e=>e.attachments??[]).find(f=>f.id===id):undefined);if(file?.status!=='ready')throw new Error('Attachment not ready or unavailable.');return previewFileUrl(previewAttachmentKey(briefId,id))},

  }
}
