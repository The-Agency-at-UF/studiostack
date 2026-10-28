import { briefSections, emptyBrief, submissionErrors, type BriefCommand, type BriefData, type ProductionAccess, type ProductionBrief, type ProductionSettings } from '../types/production'
import type { ProductionClient } from '../api/production'
export const previewPeople = [{ id: 'preview-author', displayName: 'Alex · Client Services' }, { id: 'preview-reviewer', displayName: 'Jordan · Production leadership' }, { id: 'preview-executive', displayName: 'Sam · Executive Leadership Team' }, { id: 'preview-admin', displayName: 'Taylor · Administrator' }]
type State = { briefs: ProductionBrief[]; settings: ProductionSettings }
const key = 'studiostack-production-preview-v1'
function initial(): State {
  const data = emptyBrief(), start = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10), delivery = new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10)
  Object.assign(data, { projectName: 'Campus stories', client: 'Example client', managers: 'Alex', supervisor: 'Jordan', deliveryDate: delivery, productionTypes: ['Videography', 'Video Editing'], fields: { summary: 'A short interview film introducing the people behind the project.', objective: 'Help students discover the program.', audience: 'University students', platform: 'Instagram and YouTube', deliverables: 'One 60-second film and two vertical cutdowns.', concept: 'Natural interviews with observational B-roll.', shootEstimate: 'Next week', proposedStart: start, proposedEnd: start, location: 'Campus studio', editingDirection: 'Conversational pacing with captions.', formats: 'Horizontal and vertical' } })
  const now = new Date().toISOString()
  return { settings: { version: 1, reviewerIds: ['preview-reviewer'], executiveIds: ['preview-executive'], approvalConfirmsDates: true }, briefs: [{ id: 'preview-brief', organizationId: 'preview', ownerId: 'preview-author', ownerName: 'Alex · Client Services', data, status: 'submitted', version: 1, submission: 1, shootStartsAt: null, shootEndsAt: null, createdAt: now, updatedAt: now, attachments: [], events: [{ id: 'preview-event', actorId: 'preview-author', actorName: 'Alex · Client Services', kind: 'submitted', comment: '', section: '', version: 1, createdAt: now, snapshot: structuredClone(data) }] }] }
}
function load(): State { try { const raw = localStorage.getItem(key); if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed.briefs) && parsed.settings) return parsed } } catch { /* Start a clean preview if browser storage is unavailable. */ } return initial() }
export function createPreviewProductionClient(person: string): ProductionClient {
  const access = (state: State): ProductionAccess => ({ userId: person, canReview: state.settings.reviewerIds.includes(person), canAdminister: person === 'preview-admin', isExecutive: state.settings.executiveIds.includes(person), notificationsConfigured: false })
  const readable = (b: ProductionBrief, state: State) => person === b.ownerId || access(state).canAdminister || ((access(state).canReview || access(state).isExecutive) && b.status !== 'draft')
  function find(state: State, id: string) { const brief = state.briefs.find(b => b.id === id); if (!brief || !readable(brief, state)) throw new Error('Brief not found'); return brief }
  const persist = (state: State) => { localStorage.setItem(key, JSON.stringify(state)) }
  const append = (brief: ProductionBrief, kind: string, comment = '', section = '', snapshot: BriefData | null = null) => { brief.updatedAt = new Date().toISOString(); brief.events.push({ id: crypto.randomUUID(), actorId: person, actorName: previewPeople.find(p => p.id === person)!.displayName, kind, comment, section, snapshot, shootStartsAt: brief.shootStartsAt, shootEndsAt: brief.shootEndsAt, version: brief.version, createdAt: brief.updatedAt }) }
  return {
    access: async () => access(load()), settings: async () => { const s = load(); if (!access(s).canAdminister) throw new Error('Administrator required'); return structuredClone(s.settings) },
    saveSettings: async input => { const state = load(); if (!access(state).canAdminister) throw new Error('Administrator required'); if (input.version !== state.settings.version) throw new Error('Settings changed. Reload first.'); state.settings = { ...input, version: input.version + 1 }; persist(state); return structuredClone(state.settings) },
    list: async () => { const s = load(); return { items: structuredClone(s.briefs.filter(b => readable(b, s))), nextCursor: null } },
    get: async id => structuredClone(find(load(), id)),
    create: async (data, requestId) => { const state = load(); const found = state.briefs.find(b => b.id === requestId); if (found) return structuredClone(found); const now = new Date().toISOString(); const brief: ProductionBrief = { id: requestId, organizationId: 'preview', ownerId: person, ownerName: previewPeople.find(p => p.id === person)!.displayName, data, status: 'draft', version: 1, submission: 0, shootStartsAt: null, shootEndsAt: null, createdAt: now, updatedAt: now, events: [], attachments: [] }; append(brief, 'created'); state.briefs.push(brief); persist(state); return structuredClone(brief) },
    save: async (id, data, expected) => { const state = load(), b = find(state,id); if (b.ownerId !== person || !['draft','changes_requested'].includes(b.status)) throw new Error('This brief cannot be edited'); if (b.version !== expected) throw new Error('This brief changed. Reload first.'); b.data = data; b.version++; append(b,'saved'); persist(state); return structuredClone(b) },
    action: async (id, c: BriefCommand) => {
      const state = load(), b = find(state,id), a = access(state), own = b.ownerId === person
      if (b.version !== c.version) throw new Error('This brief changed. Reload first.')
      let kind: string = c.action
      if (c.action === 'submit') { if (!own || !['draft','changes_requested'].includes(b.status)) throw new Error('Only the author can submit a draft'); const errors = submissionErrors(b.data); if (errors.length) throw new Error(`Complete: ${errors.join(', ')}`); b.status = 'submitted'; b.submission++ }
      else if (['approve','request_changes','deny','schedule'].includes(c.action)) {
        if (!a.canReview) throw new Error('Production leadership access required')
        if (c.action === 'schedule' ? b.status !== 'approved' : !['submitted', ...(c.action === 'request_changes' ? ['approved'] : [])].includes(b.status)) throw new Error('Action unavailable for this status')
        if (['request_changes','deny'].includes(c.action) && !c.comment?.trim()) throw new Error('A reason is required')
        if (c.action === 'approve' || c.action === 'schedule') {
          if (b.data.productionTypes.some(t => ['Photography','Videography'].includes(t))) {
            const start = c.shootStartsAt ?? (b.data.fields.proposedStart && `${b.data.fields.proposedStart}T00:00:00.000Z`), end = c.shootEndsAt ?? (b.data.fields.proposedEnd && new Date(Date.parse(b.data.fields.proposedEnd) + 86400_000).toISOString())
            if (!start || !end || Date.parse(end) <= Date.parse(start)) throw new Error('Choose concrete shoot dates before approval')
            if (b.data.deliveryDate && Date.parse(end) > Date.parse(b.data.deliveryDate) + 86400_000) throw new Error('Shoot must finish by delivery')
            b.shootStartsAt = start; b.shootEndsAt = end
          }
          b.status = 'approved'; kind = c.action === 'approve' ? 'approved' : 'scheduled'
        }
        if (c.action === 'request_changes') { b.status = 'changes_requested'; b.shootStartsAt = null; b.shootEndsAt = null; kind = 'changes_requested' }
        if (c.action === 'deny') { b.status = 'denied'; kind = 'denied' }
      } else if (c.action === 'withdraw') { if ((!own && !a.canReview) || !['submitted','approved','changes_requested'].includes(b.status)) throw new Error('Cannot withdraw this brief'); b.status = 'withdrawn'; b.shootStartsAt = null; b.shootEndsAt = null; kind = 'withdrawn' }
      else if (c.action === 'reopen') { if (!own || !['denied','withdrawn'].includes(b.status)) throw new Error('Cannot reopen this brief'); b.status = 'draft'; kind = 'reopened' }
      else if (c.action === 'comment') { if ((!own && !a.canReview) || !c.comment?.trim() || ['denied','withdrawn'].includes(b.status)) throw new Error('Cannot add this comment'); if (c.section && !briefSections.some(s=>s.title === c.section)) throw new Error('Unknown section'); kind = 'commented' }
      b.version++; append(b,kind,c.comment,c.section,['submit','approve','request_changes','deny','schedule'].includes(c.action) ? structuredClone(b.data) : null); persist(state); return structuredClone(b)
    },
    deliveries: async () => ({ items: [], nextCursor: null }), retry: async () => { throw new Error('Preview does not send notifications') },
    attach: async () => { throw new Error('Sign in to upload private attachments. You can use asset links in preview.') }, complete: async () => { throw new Error('Sign in to upload attachments') }, discard: async () => { throw new Error('Sign in to manage attachments') }, download: async () => { throw new Error('Sign in to download attachments') },
  }
}
