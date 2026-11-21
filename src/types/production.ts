export const productionTypes = ['Photography', 'Videography', 'Video Editing', 'Motion Graphics'] as const
type ProductionType = typeof productionTypes[number]
export const briefStatuses = ['draft', 'submitted', 'changes_requested', 'approved', 'denied', 'withdrawn'] as const
type BriefStatus = typeof briefStatuses[number]
export const statusLabels: Record<BriefStatus, string> = { draft: 'Draft', submitted: 'In review', changes_requested: 'Changes requested', approved: 'Approved', denied: 'Denied', withdrawn: 'Withdrawn' }
type Field = { key: string; label: string; type?: 'textarea' | 'date' | 'url' | 'select'; options?: string[]; required?: boolean }
type Section = { title: string; scope?: 'onsite' | 'post'; fields: Field[] }
export const briefSections: Section[] = [
  { title: 'Project overview', fields: [
    { key: 'summary', label: 'Project summary', type: 'textarea', required: true }, { key: 'objective', label: 'Primary objective', type: 'textarea', required: true },
    { key: 'audience', label: 'Target audience', required: true }, { key: 'platform', label: 'Where will the content appear?', required: true }, { key: 'cta', label: 'Call to action' },
  ] },
  { title: 'Creative direction', fields: [
    { key: 'concept', label: 'Creative concept', type: 'textarea' }, { key: 'tone', label: 'Tone / feel' }, { key: 'references', label: 'Visual reference links', type: 'textarea' },
    { key: 'brandProvided', label: 'Brand guidelines provided?', type: 'select', options: ['Yes', 'No', 'TBD'] }, { key: 'brandLink', label: 'Brand guidelines link', type: 'url' },
    { key: 'brandElements', label: 'Required logos, fonts, colors, graphics and lower thirds', type: 'textarea' }, { key: 'restrictions', label: 'Brand restrictions / things to avoid', type: 'textarea' },
    { key: 'mustHaves', label: 'Creative must-haves', type: 'textarea' }, { key: 'considerations', label: 'Creative requirements or limitations', type: 'textarea' },
  ] },
  { title: 'Deliverables', fields: [
    { key: 'deliverables', label: 'Deliverables and quantity', type: 'textarea', required: true }, { key: 'length', label: 'Length / runtime' }, { key: 'formats', label: 'Required formats / aspect ratios' },
    { key: 'captions', label: 'Captions / subtitles', type: 'select', options: ['No captions', 'Burned in', 'Both', 'TBD'] }, { key: 'additionalDeliverables', label: 'Cutdowns, alternate formats, raw footage or other outputs', type: 'textarea' },
  ] },
  { title: 'On-site production', scope: 'onsite', fields: [
    { key: 'shootEstimate', label: 'Shoot date estimate (month, date window or notes)', required: true }, { key: 'proposedStart', label: 'Projected shoot window starts', type: 'date' }, { key: 'proposedEnd', label: 'Projected shoot window ends', type: 'date' },
    { key: 'location', label: 'Primary location', required: true }, { key: 'otherLocations', label: 'Additional locations' }, { key: 'locationContact', label: 'Location contact' },
    { key: 'locationRestrictions', label: 'Location restrictions / requirements', type: 'textarea' }, { key: 'parking', label: 'Parking / load-in' }, { key: 'access', label: 'Building access / security' },
    { key: 'contentType', label: 'Production format (interview, event, brand film, etc.)' },
    { key: 'talent', label: 'Talent / interviewees, roles, wardrobe and notes', type: 'textarea' },
  ] },
  { title: 'Paperwork', fields: [
    { key: 'permits', label: 'Permits required?', type: 'select', options: ['Yes', 'No', 'TBD'] },
    { key: 'releases', label: 'Talent releases required?', type: 'select', options: ['Yes', 'No', 'TBD'] },
    { key: 'releaseProvider', label: 'Who provides releases?' },
  ] },
  { title: 'Post-production', scope: 'post', fields: [
    { key: 'editingDirection', label: 'Editing style / direction', type: 'textarea', required: true }, { key: 'referenceEdits', label: 'Reference edits', type: 'textarea' },
    { key: 'editingRequirements', label: 'Editing requirements (B-roll, graphics, color, audio, stock, etc.)', type: 'textarea' },
    { key: 'opening', label: 'Opening / hook' }, { key: 'mainContent', label: 'Main content / story structure', type: 'textarea' }, { key: 'ending', label: 'Ending / CTA' },
    { key: 'messaging', label: 'Required messaging / copy', type: 'textarea' }, { key: 'scriptApproval', label: 'Script approval required before editing?', type: 'select', options: ['Yes', 'No', 'TBD'] },
  ] },
  { title: 'Music and assets', fields: [
    { key: 'musicRequired', label: 'Music required?', type: 'select', options: ['Yes', 'No', 'TBD'] }, { key: 'musicSource', label: 'Music source', type: 'select', options: ['Stock website', 'Client-provided', 'Original composition', 'TBD'] },
    { key: 'musicReference', label: 'Music style / reference' }, { key: 'assets', label: 'Assets: what, provided by, file/link location and approval status', type: 'textarea' },
    { key: 'archiveRequired', label: 'Archive footage required?', type: 'select', options: ['Yes', 'No', 'TBD'] }, { key: 'archiveSource', label: 'Archive footage source' }, { key: 'usageRights', label: 'Usage rights confirmed?', type: 'select', options: ['Yes', 'No', 'TBD'] },
  ] },
  { title: 'Timeline', fields: [
    { key: 'conceptReview', label: 'Concept review', type: 'date' }, { key: 'locationConfirmed', label: 'Location confirmed', type: 'date' }, { key: 'paperworkDue', label: 'Signed paperwork due', type: 'date' }, { key: 'assetsDue', label: 'Brand assets due', type: 'date' },
    { key: 'preProduction', label: 'Pre-production complete', type: 'date' }, { key: 'roughCut', label: 'Rough cut', type: 'date' }, { key: 'internalReview', label: 'Internal review', type: 'date' },
    { key: 'firstRevisions', label: 'First revisions', type: 'date' }, { key: 'clientReview', label: 'Client review', type: 'date' }, { key: 'secondRevisions', label: 'Second revisions', type: 'date' }, { key: 'finalApproval', label: 'Final internal approval', type: 'date' },
  ] },
]
export const crewRoles = ['Videographer','Photographer','Video Editor','Line Producer','Production Supervisor'] as const
export interface CrewRequest { id:string; role:typeof crewRoles[number]; startsAt:string; endsAt:string; location:string }
export interface SoftHold { id:string; startsAt:string; endsAt:string }
export const attachmentCategories = { brand_guidelines:'Brand guidelines', creative_assets:'Logos, graphics & lower thirds', creative_brief:'Creative brief (PDF)', shot_list:'Shot list', release:'Signed release forms', location_agreement:'Location permission / shoot agreement', consent:'Signed consent forms', storyboard:'Storyboard (optional)', reference:'Other references' } as const
export type AttachmentCategory = keyof typeof attachmentCategories
export interface ClientAccount { logoPhotoId?:string|null;id:string;name:string;version:number;createdBy:string|null;deletedAt:string|null;archivedAt?:string|null}
export interface ProductionAssignment {crewRequestId?:string|null;userId:string;name:string;role:string}
export interface BriefData { crewRequests?:CrewRequest[]; clientAccountId?:string|null; projectName: string; client: string; managers: string; supervisor: string; deliveryDate: string; productionTypes: ProductionType[]; fields: Record<string, string> }
export interface BriefEvent { id: string; actorId: string; actorName: string; kind: string; comment: string; section: string; version: number; createdAt: string; snapshot: BriefData | null; attachments?: BriefAttachment[]; shootStartsAt?: string | null; shootEndsAt?: string | null }
export interface BriefAttachment { category?:AttachmentCategory; id: string; name: string; contentType: string; size: number; status: 'pending' | 'ready'; uploadedBy: string }
export interface ProductionBrief {softHolds?:SoftHold[]|null; crew?:ProductionAssignment[]; id: string; organizationId: string; ownerId: string; ownerName: string; status: BriefStatus; version: number; submission: number; data: BriefData; shootStartsAt: string | null; shootEndsAt: string | null; createdAt: string; updatedAt: string; events: BriefEvent[]; attachments: BriefAttachment[] }
export interface ProductionSettings { version: number; reviewerIds: string[]; executiveIds: string[]; approvalConfirmsDates: boolean }
export interface ProductionAccess { userId: string; canReview: boolean; canAdminister: boolean; isExecutive: boolean; notificationsConfigured: boolean }
export type BriefAction = 'submit' | 'approve' | 'request_changes' | 'deny' | 'comment' | 'withdraw' | 'reopen' | 'schedule' | 'propose_dates'
export interface BriefCommand { softHolds?:SoftHold[]; softHoldId?:string; action: BriefAction; version: number; requestId: string; comment?: string; section?: string; shootStartsAt?: string; shootEndsAt?: string }
export interface Delivery { id: string; briefId: string; eventId: string; status: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain'; attempts: number; createdAt: string; sentAt: string | null }
export const emptyBrief = (): BriefData => ({ projectName: '', client: '', managers: '', supervisor: '', deliveryDate: '', productionTypes: [], fields: {} })
export const productionIsOnSite = (data: BriefData) => data.productionTypes.some(t => t === 'Photography' || t === 'Videography')
export function visibleSections(data: BriefData) { return briefSections.filter(s => !s.scope || (s.scope === 'onsite' ? productionIsOnSite(data) : data.productionTypes.some(t => t === 'Video Editing' || t === 'Motion Graphics'))) }
/** The brief without answers from sections its production types no longer show, so a hidden step can't still set dates. */
export function withoutHiddenFields(data: BriefData): BriefData {
  const keys = new Set(visibleSections(data).flatMap(s => s.fields.map(f => f.key)))
  return { ...data, fields: Object.fromEntries(Object.entries(data.fields).filter(([k]) => keys.has(k))) }
}
/** The brief as it is saved: hidden sections dropped and text trimmed. */
export function normalizedBrief(data: BriefData): BriefData {
  const clean = withoutHiddenFields(data), trim = (v: string) => v.trim()
  return { ...clean, projectName: trim(clean.projectName), client: trim(clean.client), managers: trim(clean.managers), supervisor: trim(clean.supervisor), fields: Object.fromEntries(Object.entries(clean.fields).map(([k, v]) => [k, trim(v)])) }
}
/** The projected shoot window, only while the On-site production step is part of the brief. */
export function proposedWindow(data: BriefData): { start: string; end: string } | null {
  const fields = withoutHiddenFields(data).fields
  const start = fields.proposedStart, end = fields.proposedEnd
  return start && end && end >= start && (!data.deliveryDate || end <= data.deliveryDate) ? { start, end } : null
}
const today = () => new Date().toISOString().slice(0, 10)
/** Date mistakes in the brief, keyed by the field to fix. `saving` limits it to the checks the server applies on every save. */
export function dateErrors(data: BriefData, saving = false): { key: string; message: string }[] {
  const f = withoutHiddenFields(data).fields, delivery = data.deliveryDate, errors: { key: string; message: string }[] = []
  if (!saving && delivery && delivery < today()) errors.push({ key: 'deliveryDate', message: 'Target delivery date is in the past.' })
  if (Boolean(f.proposedStart) !== Boolean(f.proposedEnd)) errors.push({ key: f.proposedStart ? 'proposedEnd' : 'proposedStart', message: 'Give both a start and an end for the projected shoot window.' })
  else if (f.proposedStart && f.proposedEnd < f.proposedStart) errors.push({ key: 'proposedEnd', message: 'Projected shoot window ends before it starts.' })
  else if (f.proposedEnd && delivery && f.proposedEnd > delivery) errors.push({ key: 'proposedEnd', message: 'Projected shoot must finish by the target delivery date.' })
  for (const field of briefSections.find(s => s.title === 'Timeline')!.fields) if (f[field.key] && delivery && f[field.key] > delivery) errors.push({ key: field.key, message: `${field.label} is after the target delivery date.` })
  return errors
}
export function submissionErrors(data: BriefData): string[] {
  const errors = (['projectName', 'client', 'managers', 'deliveryDate'] as const).filter(k => !data[k].trim()).map(k => ({ projectName: 'Project name', client: 'Client', managers: 'Account / project managers', deliveryDate: 'Target delivery date' })[k])
  if (!data.productionTypes.length) errors.push('Production type')
  for (const section of visibleSections(data)) for (const field of section.fields) if (field.required && !data.fields[field.key]?.trim()) errors.push(field.label)
  return [...errors, ...dateErrors(data).map(e => e.message)]
}

export const ideaStatuses = {idea:'Idea',pitched:'Pitched',selected:'Selected',archived:'Archived'} as const
export interface ProductionIdea {id:string;authorId:string;authorName:string;clientAccountId:string|null;title:string;pitch:string;status:keyof typeof ideaStatuses;version:number;createdAt:string;updatedAt:string}
export type IdeaInput = Pick<ProductionIdea,'title'|'pitch'|'clientAccountId'>

export const sectionId = (title:string)=>`brief-${title.toLowerCase().replaceAll(' ','-')}`
