import { createHash } from 'node:crypto'
import type { DatabaseClient } from '../database/client'
import { ApiError, object, uuid } from '../database/api-validation'
import type { Page } from '../database/api-repository'
import { briefData, briefCommand, productionSettings, version } from './validation'
import { submissionErrors, type BriefCommand, type BriefData, type ProductionBrief, type ProductionSettings } from '../../src/types/production'
export type ProductionRequest = { operation: 'production'; organizationId: string; resource: string; method: string; briefId?: string; attachmentId?: string; deliveryId?: string; body?: unknown; page: Page }
export type ProductionContext = { organizationId: string; user: { id: string; displayName?: string | null }; membership: { role: string } }
const columns = `b.id, b.organization_id AS "organizationId", b.owner_id AS "ownerId", COALESCE(u.display_name, 'Team member') AS "ownerName", b.status, b.version, b.submission, b.data, b.shoot_starts_at AS "shootStartsAt", b.shoot_ends_at AS "shootEndsAt", b.created_at AS "createdAt", b.updated_at AS "updatedAt"`
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const deny = (message = 'You do not have permission for this action'): never => { throw new ApiError(403, message) }
const conflict = (message = 'This brief changed. Reload it before saving.'): never => { throw new ApiError(409, message) }
const defaultSettings = (): ProductionSettings => ({ version: 0, reviewerIds: [], executiveIds: [], approvalConfirmsDates: true })
export async function dispatchProduction(client: DatabaseClient, request: ProductionRequest, context: ProductionContext): Promise<unknown> {
  const { organizationId, user, membership } = context
  const admin = ['owner', 'admin'].includes(membership.role)
  const settingsRow = (await client.query('SELECT version, reviewer_ids AS "reviewerIds", executive_ids AS "executiveIds", approval_confirms_dates AS "approvalConfirmsDates" FROM app.production_settings WHERE organization_id = $1', [organizationId])).rows[0]
  const settings = (settingsRow ?? defaultSettings()) as ProductionSettings
  const reviewer = settings.reviewerIds.includes(user.id), executive = settings.executiveIds.includes(user.id)
  const editable = (brief: ProductionBrief) => brief.ownerId === user.id && ['draft', 'changes_requested'].includes(brief.status)
  const readable = (brief: ProductionBrief) => admin || brief.ownerId === user.id || ((reviewer || executive) && brief.status !== 'draft')
  async function getBrief(lock = false): Promise<ProductionBrief> {
    const result = await client.query(`SELECT ${columns} FROM app.production_briefs b JOIN app.users u ON u.id = b.owner_id WHERE b.organization_id = $1 AND b.id = $2 ${lock ? 'FOR UPDATE OF b' : ''}`, [organizationId, request.briefId])
    const brief = result.rows[0] as ProductionBrief | undefined
    if (!brief || !readable(brief)) throw new ApiError(404, 'Brief not found')
    return brief
  }
  async function detail(brief: ProductionBrief) {
    const events = await client.query(`SELECT e.id, e.actor_id AS "actorId", COALESCE(u.display_name, 'Team member') AS "actorName", e.kind, e.comment, e.section, e.version, e.created_at AS "createdAt", e.snapshot, e.attachment_snapshot AS attachments, e.shoot_starts_at AS "shootStartsAt", e.shoot_ends_at AS "shootEndsAt" FROM app.production_brief_events e JOIN app.users u ON u.id = e.actor_id WHERE e.organization_id = $1 AND e.brief_id = $2 ORDER BY e.version, e.created_at, e.id`, [organizationId, brief.id])
    return { ...brief, events: events.rows, attachments: [] }
  }
  async function event(brief: ProductionBrief, kind: string, requestId: string, requestHash: string, comment = '', section = '', snapshot: BriefData | null = null) {
    const files: unknown[] = []
    await client.query('INSERT INTO app.production_brief_events (organization_id, brief_id, actor_id, kind, version, request_id, request_hash, comment, section, snapshot, shoot_starts_at, shoot_ends_at, attachment_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id', [organizationId, brief.id, user.id, kind, brief.version, requestId, requestHash, comment, section, snapshot, brief.shootStartsAt, brief.shootEndsAt, JSON.stringify(files)])
  }
  async function previousEvent(requestId: string, fingerprint: string) {
    const result = await client.query('SELECT actor_id, request_hash FROM app.production_brief_events WHERE organization_id = $1 AND brief_id = $2 AND request_id = $3', [organizationId, request.briefId, requestId])
    if (!result.rows.length) return false
    if (result.rows[0].actor_id !== user.id || result.rows[0].request_hash !== fingerprint) conflict('Request ID already used for different content')
    return true
  }
  if (request.resource === 'access') return { userId: user.id, canReview: reviewer, canAdminister: admin, isExecutive: executive, notificationsConfigured: false }
  if (request.resource === 'settings') {
    if (!admin) deny('An organization administrator manages production access')
    if (request.method === 'GET') return settings
    const input = productionSettings(request.body)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`production-settings:${organizationId}`])
    const current = (await client.query('SELECT version FROM app.production_settings WHERE organization_id = $1 FOR UPDATE', [organizationId])).rows[0]
    if ((current?.version ?? 0) !== input.version) conflict('Settings changed. Reload before saving.')
    const ids = [...new Set([...input.reviewerIds, ...input.executiveIds])]
    const members = await client.query('SELECT user_id FROM app.organization_memberships WHERE organization_id = $1 AND status = $2 AND user_id = ANY($3::uuid[])', [organizationId, 'active', ids])
    if (members.rows.length !== ids.length) throw new ApiError(400, 'Select active members of this organization')
    await client.query(`INSERT INTO app.production_settings (organization_id, reviewer_ids, executive_ids, approval_confirms_dates) VALUES ($1,$2,$3,true)
      ON CONFLICT (organization_id) DO UPDATE SET version = app.production_settings.version + 1, reviewer_ids = EXCLUDED.reviewer_ids, executive_ids = EXCLUDED.executive_ids, approval_confirms_dates = true`, [organizationId, input.reviewerIds, input.executiveIds])
    return { ...input, version: input.version + 1, approvalConfirmsDates: true }
  }
  if (request.resource === 'briefs' && request.method === 'GET' && !request.briefId) {
    const { page } = request
    const result = await client.query(`SELECT ${columns} FROM app.production_briefs b JOIN app.users u ON u.id = b.owner_id WHERE b.organization_id = $1 AND ($2::uuid IS NULL OR b.id > $2) AND ($4::boolean OR b.owner_id = $5 OR ($6::boolean AND b.status <> 'draft')) ORDER BY b.id LIMIT $3`, [organizationId, page.after, page.limit + 1, admin, user.id, reviewer || executive])
    const items = result.rows.slice(0, page.limit).map(b => ({ ...b, events: [], attachments: [] }))
    return { items, nextCursor: result.rows.length > page.limit ? items[items.length - 1].id : null }
  }
  if (request.resource === 'briefs' && request.method === 'POST' && !request.briefId) {
    const body = object(request.body, ['data', 'requestId']), data = briefData(body.data), requestId = uuid(body.requestId), fingerprint = hash(data)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`brief:${organizationId}:${user.id}:${requestId}`])
    const previous = (await client.query('SELECT id, request_hash FROM app.production_briefs WHERE organization_id = $1 AND owner_id = $2 AND request_id = $3', [organizationId, user.id, requestId])).rows[0]
    if (previous) { if (previous.request_hash !== fingerprint) conflict('Request ID already used for different content'); request.briefId = previous.id; return detail(await getBrief()) }
    const inserted = await client.query('INSERT INTO app.production_briefs (organization_id, owner_id, data, request_id, request_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id', [organizationId, user.id, data, requestId, fingerprint])
    request.briefId = inserted.rows[0].id
    const brief = await getBrief()
    await event(brief, 'created', requestId, fingerprint)
    return detail(brief)
  }
  const brief = await getBrief(request.method !== 'GET')
  if (request.resource === 'briefs' && request.method === 'GET') return detail(brief)
  if (request.resource === 'briefs' && request.method === 'PATCH') {
    const body = object(request.body, ['data', 'version', 'requestId']), data = briefData(body.data), expected = version(body.version), requestId = uuid(body.requestId), fingerprint = hash({ data, version: expected })
    if (await previousEvent(requestId, fingerprint)) return detail(brief)
    if (!editable(brief)) deny('Only the author can edit a draft or a brief with requested changes')
    if (expected !== brief.version) conflict()
    brief.data = data; brief.version++
    await client.query('UPDATE app.production_briefs SET data = $3, version = $4, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, brief.id, data, brief.version])
    await event(brief, 'saved', requestId, fingerprint)
    return detail(await getBrief())
  }
  if (request.resource === 'actions') {
    const command = briefCommand(request.body), fingerprint = hash(command)
    if (await previousEvent(command.requestId, fingerprint)) return detail(brief)
    if (command.version !== brief.version) conflict()
    const { action, comment = '', section = '' } = command
    let kind: string = action
    if (action === 'submit') {
      if (!editable(brief)) deny('Only the author can submit this brief')
      const missing = submissionErrors(brief.data)
      if (missing.length) throw new ApiError(400, `Complete required fields: ${missing.join(', ')}`)
      brief.status = 'submitted'; brief.submission++; kind = 'submitted'
    } else if (['approve', 'request_changes', 'deny', 'schedule'].includes(action)) {
      if (!reviewer) deny('Production leadership review access is required')
      if (action === 'schedule' ? brief.status !== 'approved' : !['submitted', ...(action === 'request_changes' ? ['approved'] : [])].includes(brief.status)) conflict('This action is not available for the current brief status')
      if (action === 'approve') { brief.status = 'approved'; kind = 'approved'; confirmSchedule(brief, command) }
      if (action === 'request_changes') { brief.status = 'changes_requested'; kind = 'changes_requested'; brief.shootStartsAt = null; brief.shootEndsAt = null }
      if (action === 'deny') { brief.status = 'denied'; kind = 'denied' }
      if (action === 'schedule') { confirmSchedule(brief, command); kind = 'scheduled' }
    } else if (action === 'withdraw') {
      if (brief.ownerId !== user.id && !reviewer) deny()
      if (!['submitted', 'approved', 'changes_requested'].includes(brief.status)) conflict('Only an active request can be withdrawn')
      brief.status = 'withdrawn'; brief.shootStartsAt = null; brief.shootEndsAt = null; kind = 'withdrawn'
    } else if (action === 'reopen') {
      if (brief.ownerId !== user.id) deny()
      if (!['denied', 'withdrawn'].includes(brief.status)) conflict('Only a denied or withdrawn brief can be reopened')
      brief.status = 'draft'; kind = 'reopened'
    } else if (action === 'comment') {
      if (brief.ownerId !== user.id && !reviewer) deny('Only the author or Production leadership can comment')
      if (['denied', 'withdrawn'].includes(brief.status)) conflict('Reopen the brief before commenting')
      kind = 'commented'
    }
    brief.version++
    await client.query('UPDATE app.production_briefs SET status = $3, version = $4, submission = $5, shoot_starts_at = $6, shoot_ends_at = $7, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, brief.id, brief.status, brief.version, brief.submission, brief.shootStartsAt, brief.shootEndsAt])
    await event(brief, kind, command.requestId, fingerprint, comment, section, ['submit','approve','request_changes','deny','schedule'].includes(action) ? brief.data : null)
    return detail(await getBrief())
  }
  throw new ApiError(404, 'Route not found')
}
function confirmSchedule(brief: ProductionBrief, command: BriefCommand) {
  const onsite = brief.data.productionTypes.some(t => ['Photography', 'Videography'].includes(t))
  if (!onsite && !command.shootStartsAt) { brief.shootStartsAt = null; brief.shootEndsAt = null; return }
  const start = command.shootStartsAt ?? (brief.data.fields.proposedStart ? `${brief.data.fields.proposedStart}T00:00:00.000Z` : undefined)
  const end = command.shootEndsAt ?? (brief.data.fields.proposedEnd ? new Date(Date.parse(brief.data.fields.proposedEnd) + 86400_000).toISOString() : undefined)
  if (!start || !end || Date.parse(end) <= Date.parse(start)) throw new ApiError(400, 'Choose concrete shoot dates before approving this brief')
  if (brief.data.deliveryDate && Date.parse(end) > Date.parse(brief.data.deliveryDate) + 86400_000) throw new ApiError(400, 'Confirmed shoot must finish by delivery')
  brief.shootStartsAt = start; brief.shootEndsAt = end
}
