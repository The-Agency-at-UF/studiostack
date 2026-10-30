import { dispatchProduction, type ProductionRequest } from '../production/repository'
import {dispatchAccounts} from '../accounts/repository'
import type {AccountRequest} from '../accounts/routes'
import type { BriefStorage } from '../production/storage'
import { createHash, randomUUID } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import type { createDatabase, DatabaseClient } from './client'
import { ApiError } from './api-validation'
import type { ApiPage, CreateEquipment, UpdateEquipment, CreateReservation, CreatePhotoUpload } from '../../src/types/database-api'
import type { PendingPhoto, PhotoStorage } from './photo-storage'

export interface Identity { issuer: string; subject: string; email: string | null }
export type Page = { limit: number; after: string | null }
export type ApiRequest =
  | AccountRequest
  | ProductionRequest
  | { operation: 'me' }
  | { operation: 'register'; displayName: string | null }
  | { operation: 'organizations'; page: Page }
  | { operation: 'members' | 'groups' | 'inventory' | 'reservations'; organizationId: string; page: Page }
  | { operation: 'createGroup'; organizationId: string; name: string }
  | { operation: 'createEquipment'; organizationId: string; input: CreateEquipment }
  | { operation: 'updateEquipment'; organizationId: string; itemId: string; input: UpdateEquipment }
  | { operation: 'createReservation'; organizationId: string; input: CreateReservation }
  | { operation: 'reservation' | 'cancelReservation'; organizationId: string; reservationId: string }
  | { operation: 'photoUpload'; organizationId: string; input: CreatePhotoUpload }
  | { operation: 'completePhoto'; organizationId: string; photoId: string }
  | { operation: 'downloadPhoto'; organizationId: string; itemId: string }
type User = QueryResultRow & { id: string; email: string | null; displayName: string | null }
type Membership = QueryResultRow & { role: 'owner' | 'admin' | 'member' }
type ReservationRow = QueryResultRow & { id: string; userId: string; status: string; requestHash?: string }
const userColumns = 'id, email, display_name AS "displayName"'
const equipmentColumns = 'id, equipment_code AS "equipmentCode", name, category, status, created_at AS "createdAt", photo_id AS "photoId"'
const reservationColumns = `r.id, r.user_id AS "userId", r.name, r.starts_at AS "startsAt", r.ends_at AS "endsAt", r.status, r.created_at AS "createdAt",
  ARRAY(SELECT i.equipment_id FROM app.reservation_items i WHERE i.organization_id = r.organization_id AND i.reservation_id = r.id ORDER BY i.equipment_id) AS "equipmentIds"`

function page<T extends { id: string }>(rows: T[], size: number): ApiPage<T> {
  const items = rows.slice(0, size)
  return { items, nextCursor: rows.length > size ? items[items.length - 1].id : null }
}
function admin(membership: Membership) {
  if (!['owner', 'admin'].includes(membership.role)) throw new ApiError(403, 'Organization administrator required')
}

export function createApiRepository(database: Pick<ReturnType<typeof createDatabase>, 'withClient'>, now = Date.now, storage?: PhotoStorage, briefStorage?: BriefStorage) {
  async function checkAttachment(client: DatabaseClient, organizationId: string, photoId?: string | null) {
    if (!photoId) return
    const ready = await client.query('SELECT id FROM app.photo_uploads WHERE organization_id = $1 AND id = $2 AND status = $3', [organizationId, photoId, 'ready'])
    if (!ready.rows.length) throw new ApiError(409, 'Complete a photo in this organization before attaching it')
  }
  async function dispatch(client: DatabaseClient, identity: Identity, request: ApiRequest): Promise<unknown> {
    if (request.operation === 'register') {
      const result = await client.query<User>(`INSERT INTO app.users (cognito_issuer, cognito_subject, email, display_name) VALUES ($1, $2, $3, $4)
        ON CONFLICT (cognito_issuer, cognito_subject) DO UPDATE SET email = COALESCE(EXCLUDED.email, app.users.email),
        display_name = COALESCE(EXCLUDED.display_name, app.users.display_name) RETURNING ${userColumns}`,
      [identity.issuer, identity.subject, identity.email, request.displayName])
      return result.rows[0]
    }
    const users = await client.query<User>(`SELECT ${userColumns} FROM app.users WHERE cognito_issuer = $1 AND cognito_subject = $2`, [identity.issuer, identity.subject])
    const user = users.rows[0]
    if (!user) throw new ApiError(404, 'User profile not registered; POST /me first')
    if (request.operation === 'me') return user
    if (request.operation === 'organizations') {
      const result = await client.query<QueryResultRow & { id: string }>(`SELECT o.id, o.slug, o.name, m.role FROM app.organizations o
        JOIN app.organization_memberships m ON m.organization_id = o.id WHERE m.user_id = $1 AND m.status = 'active'
        AND ($2::uuid IS NULL OR o.id > $2::uuid) ORDER BY o.id LIMIT $3`, [user.id, request.page.after, request.page.limit + 1])
      return page(result.rows, request.page.limit)
    }

    // Never authorize from an email, demo isAdmin flag, Cognito group, or request body.
    const organizationId = request.organizationId
    const memberships = await client.query<Membership>(`SELECT m.role FROM app.organization_memberships m
      WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'`, [organizationId, user.id])
    const membership = memberships.rows[0]
    if (!membership) throw new ApiError(403, 'Active organization membership required')
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])

    if (request.operation === 'production') return dispatchProduction(client, request, { organizationId, user, membership }, briefStorage)
    if (request.operation === 'accounts') return dispatchAccounts(client, request, { organizationId, user, membership })
    switch (request.operation) {
      case 'members': {
        admin(membership)
        const result = await client.query<QueryResultRow & { id: string }>(`SELECT u.id, u.email, u.display_name AS "displayName", m.role, m.status
          FROM app.organization_memberships m JOIN app.users u ON u.id = m.user_id WHERE m.organization_id = $1
          AND ($2::uuid IS NULL OR u.id > $2::uuid) ORDER BY u.id LIMIT $3`, [organizationId, request.page.after, request.page.limit + 1])
        return page(result.rows, request.page.limit)
      }
      case 'groups': {
        const result = await client.query<QueryResultRow & { id: string }>('SELECT id, name FROM app.user_groups WHERE organization_id = $1 AND archived_at IS NULL AND ($2::uuid IS NULL OR id > $2::uuid) ORDER BY id LIMIT $3', [organizationId, request.page.after, request.page.limit + 1])
        return page(result.rows, request.page.limit)
      }
      case 'createGroup': {
        admin(membership)
        return (await client.query('INSERT INTO app.user_groups (organization_id, name) VALUES ($1, $2) RETURNING id, name', [organizationId, request.name])).rows[0]
      }
      case 'inventory': {
        const result = await client.query<QueryResultRow & { id: string }>(`SELECT ${equipmentColumns} FROM app.inventory WHERE organization_id = $1 AND ($2::uuid IS NULL OR id > $2::uuid) ORDER BY id LIMIT $3`, [organizationId, request.page.after, request.page.limit + 1])
        return page(result.rows, request.page.limit)
      }
      case 'createEquipment': {
        admin(membership)
        const { equipmentCode, name, category, photoId } = request.input
        await checkAttachment(client, organizationId, photoId)
        return (await client.query(`INSERT INTO app.inventory (organization_id, equipment_code, name, category, photo_id) VALUES ($1, $2, $3, $4, $5) RETURNING ${equipmentColumns}`, [organizationId, equipmentCode, name, category, photoId ?? null])).rows[0]
      }
      case 'updateEquipment': {
        admin(membership)
        const locked = await client.query('SELECT id FROM app.inventory WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, request.itemId])
        if (!locked.rows.length) throw new ApiError(404, 'Equipment not found')
        if (request.input.status && request.input.status !== 'available') {
          const booked = await client.query(`SELECT 1 FROM app.reservation_items i JOIN app.reservations r ON r.organization_id = i.organization_id AND r.id = i.reservation_id
            WHERE i.organization_id = $1 AND i.equipment_id = $2 AND r.status = 'confirmed' AND r.ends_at > now() LIMIT 1`, [organizationId, request.itemId])
          if (booked.rows.length) throw new ApiError(409, 'Cancel active or future reservations before taking equipment out of service')
        }
        await checkAttachment(client, organizationId, request.input.photoId)
        return (await client.query(`UPDATE app.inventory SET name = COALESCE($3, name), category = COALESCE($4, category), status = COALESCE($5, status), photo_id = CASE WHEN $6::boolean THEN $7::uuid ELSE photo_id END
          WHERE organization_id = $1 AND id = $2 RETURNING ${equipmentColumns}`, [organizationId, request.itemId, request.input.name ?? null, request.input.category ?? null, request.input.status ?? null, request.input.photoId !== undefined, request.input.photoId ?? null])).rows[0]
      }
      case 'reservations': {
        const result = await client.query<QueryResultRow & { id: string }>(`SELECT ${reservationColumns} FROM app.reservations r WHERE r.organization_id = $1
          AND ($2::uuid IS NULL OR r.id > $2::uuid) AND ($4::boolean OR r.user_id = $5) ORDER BY r.id LIMIT $3`,
        [organizationId, request.page.after, request.page.limit + 1, membership.role !== 'member', user.id])
        return page(result.rows, request.page.limit)
      }
      case 'reservation':
      case 'cancelReservation': {
        const result = await client.query<ReservationRow>(`SELECT ${reservationColumns} FROM app.reservations r WHERE r.organization_id = $1 AND r.id = $2 FOR UPDATE OF r`, [organizationId, request.reservationId])
        const reservation = result.rows[0]
        if (!reservation || (membership.role === 'member' && reservation.userId !== user.id)) throw new ApiError(404, 'Reservation not found')
        if (request.operation === 'reservation') return reservation
        // Idempotent cancellation preserves the record/history; no hard deletion.
        return { ...reservation, status: (await client.query<{ status: string }>('UPDATE app.reservations SET status = $3 WHERE organization_id = $1 AND id = $2 RETURNING status', [organizationId, request.reservationId, 'cancelled'])).rows[0].status }
      }
      case 'createReservation': {
        const input = request.input
        const fingerprint = createHash('sha256').update(JSON.stringify({ name: input.name, startsAt: input.startsAt, endsAt: input.endsAt, equipmentIds: input.equipmentIds })).digest('hex')
        // Serialize retries by caller+org+request ID, then lock equipment in ID order.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${organizationId}:${user.id}:${input.requestId}`])
        const previous = await client.query<ReservationRow>(`SELECT ${reservationColumns}, r.request_hash AS "requestHash" FROM app.reservations r WHERE r.organization_id = $1 AND r.user_id = $2 AND r.request_id = $3`, [organizationId, user.id, input.requestId])
        if (previous.rows.length) {
          const { requestHash, ...reservation } = previous.rows[0]
          if (requestHash !== fingerprint) throw new ApiError(409, 'Request ID was already used with different reservation details')
          return reservation
        }
        if (Date.parse(input.startsAt) < now()) throw new ApiError(400, 'Reservations must start in the future')
        const items = await client.query<{ id: string; status: string }>('SELECT id, status FROM app.inventory WHERE organization_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE', [organizationId, input.equipmentIds])
        if (items.rows.length !== input.equipmentIds.length || items.rows.some(item => item.status !== 'available')) throw new ApiError(409, 'Equipment is missing or out of service')
        const conflicts = await client.query(`SELECT 1 FROM app.reservation_items i JOIN app.reservations r ON r.organization_id = i.organization_id AND r.id = i.reservation_id
          WHERE i.organization_id = $1 AND i.equipment_id = ANY($2::uuid[]) AND r.status = 'confirmed' AND r.starts_at < $4::timestamptz AND r.ends_at > $3::timestamptz LIMIT 1`, [organizationId, input.equipmentIds, input.startsAt, input.endsAt])
        if (conflicts.rows.length) throw new ApiError(409, 'Equipment is already reserved for this time')
        const inserted = await client.query<{ id: string }>('INSERT INTO app.reservations (organization_id, user_id, name, starts_at, ends_at, request_id, request_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [organizationId, user.id, input.name, input.startsAt, input.endsAt, input.requestId, fingerprint])
        const id = inserted.rows[0].id
        await client.query('INSERT INTO app.reservation_items (organization_id, reservation_id, equipment_id) SELECT $1, $2, unnest($3::uuid[])', [organizationId, id, input.equipmentIds])
        return (await client.query(`SELECT ${reservationColumns} FROM app.reservations r WHERE r.organization_id = $1 AND r.id = $2`, [organizationId, id])).rows[0]
      }
      case 'photoUpload': {
        admin(membership)
        if (!storage) throw new Error('Private photo storage is not configured')
        const input = request.input
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`photo:${organizationId}:${user.id}:${input.requestId}`])
        const previous = await client.query('SELECT id, staging_key AS "stagingKey", content_type AS "contentType", input_size AS "inputSize", status, expires_at AS "expiresAt" FROM app.photo_uploads WHERE organization_id = $1 AND uploaded_by = $2 AND request_id = $3', [organizationId, user.id, input.requestId])
        let photo: PendingPhoto
        if (previous.rows.length) {
          const row = previous.rows[0]
          if (row.inputSize !== input.size || row.contentType !== input.contentType) throw new ApiError(409, 'Photo request ID was used for different content')
          if (row.status !== 'pending' || Date.parse(String(row.expiresAt)) <= now()) throw new ApiError(409, 'Start a new upload with a new request ID')
          photo = { id: row.id, organizationId, stagingKey: row.stagingKey, contentType: row.contentType, inputSize: row.inputSize }
        } else {
          const id = randomUUID(), stagingKey = `staging/${organizationId}/${id}.${input.contentType === 'image/jpeg' ? 'jpg' : 'webp'}`
          await client.query('INSERT INTO app.photo_uploads (id, organization_id, uploaded_by, request_id, content_type, input_size, staging_key) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, organizationId, user.id, input.requestId, input.contentType, input.size, stagingKey])
          photo = { id, organizationId, stagingKey, contentType: input.contentType, inputSize: input.size }
        }
        return { photoId: photo.id, ...await storage.signUpload(photo) }
      }
      case 'completePhoto': {
        admin(membership)
        if (!storage) throw new Error('Private photo storage is not configured')
        const result = await client.query('SELECT id, uploaded_by AS "uploadedBy", staging_key AS "stagingKey", content_type AS "contentType", input_size AS "inputSize", status, width, height, stored_size AS size, expires_at AS "expiresAt" FROM app.photo_uploads WHERE organization_id = $1 AND id = $2 FOR UPDATE', [organizationId, request.photoId])
        const photo = result.rows[0]
        if (!photo || photo.uploadedBy !== user.id) throw new ApiError(404, 'Photo upload not found')
        if (photo.status === 'ready') return { photoId: photo.id, width: photo.width, height: photo.height, size: photo.size }
        if (Date.parse(String(photo.expiresAt)) <= now()) throw new ApiError(409, 'Photo upload expired; start a new upload')
        const stored = await storage.finalize({ id: photo.id, organizationId, stagingKey: photo.stagingKey, contentType: photo.contentType, inputSize: photo.inputSize })
        await client.query('UPDATE app.photo_uploads SET status = $3, object_key = $4, width = $5, height = $6, stored_size = $7, sha256 = $8 WHERE organization_id = $1 AND id = $2', [organizationId, photo.id, 'ready', stored.key, stored.width, stored.height, stored.size, stored.sha256])
        return { photoId: photo.id, width: stored.width, height: stored.height, size: stored.size }
      }
      case 'downloadPhoto': {
        if (!storage) throw new Error('Private photo storage is not configured')
        const result = await client.query('SELECT p.id, p.object_key AS "objectKey" FROM app.inventory i JOIN app.photo_uploads p ON p.organization_id = i.organization_id AND p.id = i.photo_id WHERE i.organization_id = $1 AND i.id = $2 AND p.status = $3', [organizationId, request.itemId, 'ready'])
        if (!result.rows.length) throw new ApiError(404, 'Attached photo not found')
        return { photoId: result.rows[0].id, ...await storage.signDownload(result.rows[0].objectKey) }
      }
    }
  }
  return {
    async execute(identity: Identity, request: ApiRequest): Promise<unknown> {
      // Return deliberate HTTP failures outside withClient's driver-error redaction.
      // Roll back *before* returning an expected failure, including SQL conflicts.
      const outcome = await database.withClient(async client => {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED')
        try {
          const value = await dispatch(client, identity, request)
          await client.query('COMMIT')
          return { value, error: null }
        } catch (error) {
          await client.query('ROLLBACK').catch(() => undefined)
          if (error instanceof ApiError) return { value: null, error }
          if ((error as { code?: string })?.code === '23505') return { value: null, error: new ApiError(409, 'A record with these unique details already exists') }
          throw error // The shared driver converts this to a generic unavailable error.
        }
      })
      if (outcome.error) throw outcome.error
      return outcome.value
    },
  }
}
