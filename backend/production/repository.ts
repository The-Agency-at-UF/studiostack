import {dispatchClients} from './clients'
import { randomUUID } from 'node:crypto'
import type { DatabaseClient } from '../database/client'
import { ApiError, object, uuid } from '../database/api-validation'
import type { Page } from '../database/api-repository'
import { briefData, briefCommand, productionSettings, version } from './validation'
import { submissionErrors, type BriefCommand, type BriefData, type ProductionBrief, type ProductionSettings } from '../../src/types/production'
import type { BriefStorage } from './storage'
import { isAdmin, pageOf, requestHash } from '../database/repository-utils'
export type ProductionRequest = { operation: 'production'; organizationId: string; resource: string; method: string; briefId?: string; clientId?:string; attachmentId?: string; deliveryId?: string; body?: unknown; page: Page }
export type ProductionContext = { organizationId: string; user: { id: string; displayName?: string | null }; membership: { role: string } }
const columns = `b.id, b.organization_id AS "organizationId", b.owner_id AS "ownerId", COALESCE(u.display_name, 'Team member') AS "ownerName", b.status, b.version, b.submission, b.data, b.shoot_starts_at AS "shootStartsAt", b.shoot_ends_at AS "shootEndsAt", b.created_at AS "createdAt", b.updated_at AS "updatedAt"`
const deny = (message = 'You do not have permission for this action'): never => { throw new ApiError(403, message) }
const conflict = (message = 'This brief changed. Reload it before saving.'): never => { throw new ApiError(409, message) }
const defaultSettings = (): ProductionSettings => ({ version: 0, reviewerIds: [], executiveIds: [], approvalConfirmsDates: true })
export async function dispatchProduction(client: DatabaseClient, request: ProductionRequest, context: ProductionContext, storage?: BriefStorage): Promise<unknown> {
  const { organizationId, user, membership } = context
  const admin = isAdmin(membership.role)
  const settingsRow = (await client.query('SELECT version, reviewer_ids AS "reviewerIds", executive_ids AS "executiveIds", approval_confirms_dates AS "approvalConfirmsDates" FROM app.production_settings WHERE organization_id = $1', [organizationId])).rows[0]
  const settings = (settingsRow ?? defaultSettings()) as ProductionSettings
  const reviewer = admin || settings.reviewerIds.includes(user.id), executive = settings.executiveIds.includes(user.id)
  const editable = (brief: ProductionBrief) => brief.ownerId === user.id && ['draft', 'changes_requested'].includes(brief.status)
  const readable = (brief: ProductionBrief) => admin || brief.ownerId === user.id || brief.status !== 'draft'
  async function getBrief(lock = false): Promise<ProductionBrief> {
    const result = await client.query(`SELECT ${columns} FROM app.production_briefs b JOIN app.users u ON u.id = b.owner_id WHERE b.organization_id = $1 AND b.id = $2 ${lock ? 'FOR UPDATE OF b' : ''}`, [organizationId, request.briefId])
    const brief = result.rows[0] as ProductionBrief | undefined
    if (!brief || !readable(brief)) throw new ApiError(404, 'Brief not found')
    return brief
  }
  async function crew(briefIds:string[]){
    return (await client.query(`SELECT a.brief_id AS "briefId",a.user_id AS "userId",coalesce(u.display_name,'Team member') AS name,a.role FROM app.production_assignments a JOIN app.users u ON u.id=a.user_id JOIN app.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id WHERE a.organization_id=$1 AND a.brief_id=ANY($2::uuid[]) AND m.status='active' ORDER BY a.assigned_at,a.user_id`,[organizationId,briefIds])).rows
  }
  async function checkCrewSchedule(ids:string[],brief:ProductionBrief){
    for(const id of [...ids].sort())await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`production-crew:${organizationId}:${id}`])
    const overlap=await client.query("SELECT a.user_id FROM app.production_assignments a JOIN app.production_briefs b ON b.organization_id=a.organization_id AND b.id=a.brief_id WHERE a.organization_id=$1 AND a.brief_id<>$2 AND a.user_id=ANY($3::uuid[]) AND b.status='approved' AND b.shoot_starts_at<$5 AND b.shoot_ends_at>$4 LIMIT 1",[organizationId,brief.id,ids,brief.shootStartsAt,brief.shootEndsAt])
    if(overlap.rows.length)conflict('A crew member is already assigned to an overlapping shoot')
  }
  async function notifyCrew(brief:ProductionBrief,eventId:string){
    await client.query(`INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key) SELECT $1,a.user_id,'production_assignment','Production schedule updated',$3,$4,$5 FROM app.production_assignments a JOIN app.organization_memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id WHERE a.organization_id=$1 AND a.brief_id=$2 AND m.status='active' ON CONFLICT(organization_id,recipient_id,dedupe_key) DO NOTHING`,[organizationId,brief.id,`The schedule or approval for ${brief.data.projectName} changed. Review the latest shoot details.`,`/production/?brief=${brief.id}`,'crew:'+eventId])
  }
  async function detail(brief: ProductionBrief) {
    const events = await client.query(`SELECT e.id, e.actor_id AS "actorId", COALESCE(u.display_name, 'Team member') AS "actorName", e.kind, e.comment, e.section, e.version, e.created_at AS "createdAt", e.snapshot, e.attachment_snapshot AS attachments, e.shoot_starts_at AS "shootStartsAt", e.shoot_ends_at AS "shootEndsAt" FROM app.production_brief_events e JOIN app.users u ON u.id = e.actor_id WHERE e.organization_id = $1 AND e.brief_id = $2 ORDER BY e.version, e.created_at, e.id`, [organizationId, brief.id])
    const attachments = await client.query(`SELECT id, name, content_type AS "contentType", size, status, uploaded_by AS "uploadedBy" FROM app.production_attachments WHERE organization_id = $1 AND brief_id = $2 AND status <> 'discarded' ORDER BY created_at, id`, [organizationId, brief.id])
    return { ...brief, crew:await crew([brief.id]),events: events.rows, attachments: attachments.rows }
  }
  async function event(brief: ProductionBrief, kind: string, requestId: string, requestHash: string, comment = '', section = '', snapshot: BriefData | null = null) {
    const files = snapshot ? (await client.query(`SELECT id, name, content_type AS "contentType", size, status, uploaded_by AS "uploadedBy" FROM app.production_attachments WHERE organization_id = $1 AND brief_id = $2 AND status = 'ready' ORDER BY id`, [organizationId, brief.id])).rows : []
    const result = await client.query('INSERT INTO app.production_brief_events (organization_id, brief_id, actor_id, kind, version, request_id, request_hash, comment, section, snapshot, shoot_starts_at, shoot_ends_at, attachment_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id', [organizationId, brief.id, user.id, kind, brief.version, requestId, requestHash, comment, section, snapshot, brief.shootStartsAt, brief.shootEndsAt, JSON.stringify(files)])
    if (['approved', 'changes_requested', 'denied', 'withdrawn', 'scheduled'].includes(kind)) {
      // Committed with the decision; a failed transport cannot lose or roll back it.
      const payload = { reviewer: user.displayName || 'Production leadership', projectName: brief.data.projectName, client: brief.data.client, decision: kind, comment, section, version: brief.version, deliveryDate: brief.data.deliveryDate, shootStartsAt: brief.shootStartsAt, shootEndsAt: brief.shootEndsAt }
      const recipients = [...new Set([...settings.executiveIds, brief.ownerId])]
      const activeRecipients = await client.query('SELECT user_id FROM app.organization_memberships WHERE organization_id = $1 AND status = $2 AND user_id = ANY($3::uuid[])', [organizationId, 'active', recipients])
      for (const recipient of activeRecipients.rows) await client.query('INSERT INTO app.production_outbox (organization_id, brief_id, event_id, recipient_id, payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (event_id, recipient_id) DO NOTHING', [organizationId, brief.id, result.rows[0].id, recipient.user_id, payload])
    }
    return result.rows[0].id as string
  }
  async function resolveClient(data:BriefData,previous?:BriefData){
    if(!data.clientAccountId)return
    const account=(await client.query('SELECT name,archived_at FROM app.client_accounts WHERE organization_id=$1 AND id=$2 FOR SHARE',[organizationId,data.clientAccountId])).rows[0]
    if(!account||account.archived_at&&previous?.clientAccountId!==data.clientAccountId)throw new ApiError(400,'Choose an active client account in this organization')
    data.client=account.name
  }
  async function previousEvent(requestId: string, fingerprint: string) {
    const result = await client.query('SELECT actor_id, request_hash FROM app.production_brief_events WHERE organization_id = $1 AND brief_id = $2 AND request_id = $3', [organizationId, request.briefId, requestId])
    if (!result.rows.length) return false
    if (result.rows[0].actor_id !== user.id || result.rows[0].request_hash !== fingerprint) conflict('Request ID already used for different content')
    return true
  }
  if(request.resource==='people'){if(!reviewer)deny();const result=await client.query("SELECT u.id,u.display_name AS \"displayName\",NULL AS email,m.role,m.status FROM app.organization_memberships m JOIN app.users u ON u.id=m.user_id WHERE m.organization_id=$1 AND m.status='active' AND ($2::uuid IS NULL OR u.id>$2) ORDER BY u.id LIMIT $3",[organizationId,request.page.after,request.page.limit+1]);return pageOf(result.rows,request.page.limit)}
  if(request.resource==='clients')return dispatchClients(client,request,reviewer)
  if (request.resource === 'access') return { userId: user.id, canReview: reviewer, canAdminister: admin, isExecutive: executive, notificationsConfigured: settings.executiveIds.length > 0 && process.env.PRODUCTION_EMAIL_ENABLED === 'yes' }
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
    const result = await client.query(`SELECT ${columns} FROM app.production_briefs b JOIN app.users u ON u.id = b.owner_id WHERE b.organization_id = $1 AND ($2::uuid IS NULL OR b.id > $2) AND ($4::boolean OR b.owner_id = $5 OR ($6::boolean AND b.status <> 'draft')) ORDER BY b.id LIMIT $3`, [organizationId, page.after, page.limit + 1, admin, user.id, true])
    const visible=result.rows.slice(0,page.limit),assignments=await crew(visible.map(b=>b.id))
    const items = visible.map(b => ({ ...b, crew:assignments.filter(a=>a.briefId===b.id),events: [], attachments: [] }))
    return { items, nextCursor: result.rows.length > page.limit ? items[items.length - 1].id : null }
  }
  if (request.resource === 'briefs' && request.method === 'POST' && !request.briefId) {
    const body = object(request.body, ['data', 'requestId']), data = briefData(body.data), requestId = uuid(body.requestId), fingerprint = requestHash(data)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`brief:${organizationId}:${user.id}:${requestId}`])
    const previous = (await client.query('SELECT id, request_hash FROM app.production_briefs WHERE organization_id = $1 AND owner_id = $2 AND request_id = $3', [organizationId, user.id, requestId])).rows[0]
    if (previous) { if (previous.request_hash !== fingerprint) conflict('Request ID already used for different content'); request.briefId = previous.id; return detail(await getBrief()) }
    await resolveClient(data)
    const inserted = await client.query('INSERT INTO app.production_briefs (organization_id, owner_id, data, request_id, request_hash,client_account_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [organizationId, user.id, data, requestId, fingerprint,data.clientAccountId??null])
    request.briefId = inserted.rows[0].id
    const brief = await getBrief()
    await event(brief, 'created', requestId, fingerprint)
    return detail(brief)
  }
  if (request.resource === 'deliveries') {
    if (!admin && !reviewer && !executive) deny()
    if (request.method === 'GET') {
      const result = await client.query(`SELECT id, brief_id AS "briefId", event_id AS "eventId", status, attempts, created_at AS "createdAt", sent_at AS "sentAt" FROM app.production_outbox WHERE organization_id = $1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`, [organizationId, request.page.after, request.page.limit + 1])
      return pageOf(result.rows, request.page.limit)
    }
    if (!admin) deny('Only an administrator can retry delivery')
    object(request.body, [])
    const result = await client.query("UPDATE app.production_outbox SET status = 'pending', attempts = 0, next_attempt_at = now(), lease_token = NULL, lease_until = NULL WHERE organization_id = $1 AND id = $2 AND status IN ('failed','uncertain') RETURNING id", [organizationId, request.deliveryId])
    if (!result.rows.length) conflict('Only failed or uncertain deliveries can be retried')
    return { id: result.rows[0].id }
  }
  const brief = await getBrief(request.method !== 'GET')
  if (request.resource === 'briefs' && request.method === 'GET') return detail(brief)
  if (request.resource === 'briefs' && request.method === 'PATCH') {
    const body = object(request.body, ['data', 'version', 'requestId']), data = briefData(body.data), expected = version(body.version), requestId = uuid(body.requestId), fingerprint = requestHash({ data, version: expected })
    if (await previousEvent(requestId, fingerprint)) return detail(brief)
    if (!editable(brief)) deny('Only the author can edit a draft or a brief with requested changes')
    if (expected !== brief.version) conflict()
    await resolveClient(data,brief.data)
    brief.data = data; brief.version++
    await client.query('UPDATE app.production_briefs SET data = $3, version = $4,client_account_id=$5, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, brief.id, data, brief.version,data.clientAccountId??null])
    await event(brief, 'saved', requestId, fingerprint)
    return detail(await getBrief())
  }
  if(request.resource==='crew'){
    if(!reviewer)deny('Production leadership is required to assign crew')
    const body=object(request.body,['version','requestId','assignments']),expected=version(body.version),requestId=uuid(body.requestId)
    if(!Array.isArray(body.assignments)||body.assignments.length>50)throw new ApiError(400,'Choose up to 50 crew members')
    const assignments=body.assignments.map(value=>{const v=object(value,['userId','role']);if(typeof v.role!=='string'||!v.role.trim()||v.role.length>80||Array.from(v.role).some(c=>c.charCodeAt(0)<32))throw new ApiError(400,'A crew role is required');return {userId:uuid(v.userId),role:v.role.trim()}}).sort((a,b)=>a.userId.localeCompare(b.userId))
    if(new Set(assignments.map(a=>a.userId)).size!==assignments.length)throw new ApiError(400,'Select each crew member once')
    const fingerprint=requestHash({assignments,version:expected})
    if(await previousEvent(requestId,fingerprint))return detail(brief)
    if(expected!==brief.version)conflict()
    if(brief.status!=='approved'||!brief.shootStartsAt)conflict('Approve and confirm shoot dates before assigning crew')
    const previous=await crew([brief.id]),ids=[...new Set([...previous,...assignments].map(a=>a.userId))].sort()
    await checkCrewSchedule(assignments.map(a=>a.userId),brief)
    const members=await client.query("SELECT user_id FROM app.organization_memberships WHERE organization_id=$1 AND user_id=ANY($2::uuid[]) AND status='active' FOR SHARE",[organizationId,assignments.map(a=>a.userId)])
    if(members.rows.length!==assignments.length)throw new ApiError(400,'Choose active members of this organization')
    await client.query('DELETE FROM app.production_assignments WHERE organization_id=$1 AND brief_id=$2',[organizationId,brief.id])
    for(const a of assignments)await client.query('INSERT INTO app.production_assignments(organization_id,brief_id,user_id,role,assigned_by) VALUES($1,$2,$3,$4,$5)',[organizationId,brief.id,a.userId,a.role,user.id])
    brief.version++
    await client.query('UPDATE app.production_briefs SET version=$3,updated_at=now() WHERE organization_id=$1 AND id=$2',[organizationId,brief.id,brief.version])
    const eventId=await event(brief,'crew_assigned',requestId,fingerprint,JSON.stringify(assignments))
    for(const id of ids){const next=assignments.find(a=>a.userId===id),old=previous.find(a=>a.userId===id);if(next?.role===old?.role)continue
      await client.query(`INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key) SELECT $1,$2,'production_assignment',$3,$4,$5,$6 WHERE EXISTS(SELECT 1 FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='active') ON CONFLICT(organization_id,recipient_id,dedupe_key) DO NOTHING`,[organizationId,id,next?'You have a production assignment':'Production assignment removed',next?`You are assigned as ${next.role} for ${brief.data.projectName}. Open the shoot for dates and client details.`:`You are no longer assigned to ${brief.data.projectName}.`,`/production/?brief=${brief.id}`,'crew:'+eventId])
    }
    return detail(await getBrief())
  }
  if (request.resource === 'actions') {
    const command = briefCommand(request.body), fingerprint = requestHash(command)
    if (await previousEvent(command.requestId, fingerprint)) return detail(brief)
    if (command.version !== brief.version) conflict()
    const { action, comment = '', section = '' } = command
    let kind: string = action
    if (action === 'submit') {
      if (!editable(brief)) deny('Only the author can submit this brief')
      const missing = submissionErrors(brief.data)
      if (missing.length) throw new ApiError(400, `Complete required fields: ${missing.join(', ')}`)
      const pending = await client.query("SELECT id FROM app.production_attachments WHERE organization_id = $1 AND brief_id = $2 AND status = 'pending'", [organizationId, brief.id])
      if (pending.rows.length) conflict('Finish uploading or remove pending attachments before submitting')
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
    if(brief.status==='approved')await checkCrewSchedule((await crew([brief.id])).map(a=>a.userId),brief)
    brief.version++
    await client.query('UPDATE app.production_briefs SET status = $3, version = $4, submission = $5, shoot_starts_at = $6, shoot_ends_at = $7, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, brief.id, brief.status, brief.version, brief.submission, brief.shootStartsAt, brief.shootEndsAt])
    const eventId=await event(brief, kind, command.requestId, fingerprint, comment, section, ['submit','approve','request_changes','deny','schedule'].includes(action) ? brief.data : null)
    if(['scheduled','approved','changes_requested','withdrawn'].includes(kind))await notifyCrew(brief,eventId)
    return detail(await getBrief())
  }
  if (request.resource === 'attachments') {
    if (!storage) throw new ApiError(503, 'Attachment storage is unavailable')
    if (request.method === 'POST' && !request.attachmentId) {
      if (!editable(brief)) deny('Attachments can only be added by the author while editing')
      const input = object(request.body, ['id', 'name', 'contentType', 'size']), id = uuid(input.id)
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200 || Array.from(input.name).some(c => c.charCodeAt(0) < 32 || c === '/' || c === '\\')) throw new ApiError(400, 'Invalid attachment name')
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(String(input.contentType)) || !Number.isSafeInteger(input.size) || Number(input.size) < 1 || Number(input.size) > 20 * 1024 * 1024) throw new ApiError(400, 'Use a PDF, JPEG, PNG or WebP up to 20 MiB')
      const existing = (await client.query('SELECT * FROM app.production_attachments WHERE organization_id = $1 AND id = $2', [organizationId, id])).rows[0]
      if (existing && (existing.brief_id !== brief.id || existing.uploaded_by !== user.id || existing.name !== input.name || existing.size !== input.size || existing.content_type !== input.contentType || existing.status !== 'pending')) conflict('Attachment ID already used')
      if (!existing) {
        const count = (await client.query(`SELECT count(*)::int AS count FROM app.production_attachments WHERE organization_id = $1 AND brief_id = $2 AND status <> 'discarded'`, [organizationId, brief.id])).rows[0].count
        if (count >= 20) throw new ApiError(400, 'Up to 20 attachments per brief')
        await client.query('INSERT INTO app.production_attachments (id, organization_id, brief_id, uploaded_by, name, content_type, size, object_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, organizationId, brief.id, user.id, input.name.trim(), input.contentType, input.size, `briefs/${organizationId}/${brief.id}/${id}`])
      }
      return { id, ...await storage.signUpload({ key: `briefs/${organizationId}/${brief.id}/${id}`, contentType: String(input.contentType), size: Number(input.size) }) }
    }
    const attachment = (await client.query('SELECT * FROM app.production_attachments WHERE organization_id = $1 AND brief_id = $2 AND id = $3 FOR UPDATE', [organizationId, brief.id, request.attachmentId])).rows[0]
    if (!attachment) throw new ApiError(404, 'Attachment not found')
    if (request.method === 'GET') {
      if (attachment.status !== 'ready') {
        const historical = await client.query(`SELECT id FROM app.production_brief_events WHERE organization_id = $1 AND brief_id = $2 AND attachment_snapshot @> $3::jsonb LIMIT 1`, [organizationId, brief.id, JSON.stringify([{id:attachment.id}])])
        if (attachment.status !== 'discarded' || !historical.rows.length) conflict('Attachment is not ready')
      }
      return storage.signDownload(attachment.object_key, attachment.name)
    }
    if (!editable(brief) || attachment.uploaded_by !== user.id) deny()
    if (request.method === 'DELETE') {
      await client.query("UPDATE app.production_attachments SET status = 'discarded' WHERE organization_id = $1 AND id = $2", [organizationId, attachment.id])
      brief.version++
      await client.query('UPDATE app.production_briefs SET version = $3, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, brief.id, brief.version])
      await event(brief, 'attachment_removed', randomUUID(), requestHash({attachment:attachment.id, action:'remove'}), attachment.name)
      return { id: attachment.id }
    }
    if (attachment.status === 'discarded') conflict('Attachment was removed')
    object(request.body, [])
    if (attachment.status === 'ready') return detail(brief)
    if (attachment.status !== 'ready') {
      await storage.verify({ key: attachment.object_key, size: attachment.size, contentType: attachment.content_type })
      await client.query("UPDATE app.production_attachments SET status = 'ready' WHERE organization_id = $1 AND id = $2", [organizationId, attachment.id])
    }
    brief.version++
    await client.query('UPDATE app.production_briefs SET version = $3, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, brief.id, brief.version])
    await event(brief, 'attachment_added', randomUUID(), requestHash({attachment:attachment.id, action:'complete'}), attachment.name)
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
