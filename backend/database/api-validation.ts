import { equipmentCategories } from '../../src/types/database-api'
import type { CreateEquipment, UpdateEquipment, CreateReservation, CreatePhotoUpload } from '../../src/types/database-api'

export class ApiError extends Error {
  constructor(public readonly status: 400 | 401 | 403 | 404 | 409, message: string) { super(message) }
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new ApiError(400, 'A valid UUID is required')
  return value.toLowerCase()
}
export function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) {
    throw new ApiError(400, 'Invalid request fields')
  }
  return value as Record<string, unknown>
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new ApiError(400, 'Invalid text field')
  return value.trim()
}
function category(value: unknown): CreateEquipment['category'] {
  if (!equipmentCategories.includes(value as CreateEquipment['category'])) throw new ApiError(400, 'Invalid equipment category')
  return value as CreateEquipment['category']
}
export function createEquipment(value: unknown): CreateEquipment {
  const body = object(value, ['equipmentCode', 'name', 'category', 'photoId'])
  const equipmentCode = text(body.equipmentCode, 128)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(equipmentCode)) throw new ApiError(400, 'Invalid equipment code')
  return { equipmentCode, name: text(body.name, 120), category: category(body.category), ...(body.photoId !== undefined ? { photoId: uuid(body.photoId) } : {}) }
}
export function updateEquipment(value: unknown): UpdateEquipment {
  const body = object(value, ['name', 'category', 'status', 'photoId'])
  if (!Object.keys(body).length) throw new ApiError(400, 'At least one field is required')
  if (body.status !== undefined && !['available', 'maintenance', 'retired'].includes(String(body.status))) throw new ApiError(400, 'Invalid equipment status')
  return {
    ...(body.name !== undefined ? { name: text(body.name, 120) } : {}),
    ...(body.category !== undefined ? { category: category(body.category) } : {}),
    ...(body.status !== undefined ? { status: body.status as UpdateEquipment['status'] } : {}),
    ...(body.photoId !== undefined ? { photoId: body.photoId === null ? null : uuid(body.photoId) } : {}),
  }
}
export function createPhotoUpload(value: unknown): CreatePhotoUpload {
  const body = object(value, ['organizationId', 'contentType', 'size', 'requestId'])
  if (!['image/jpeg', 'image/webp'].includes(String(body.contentType)) || !Number.isSafeInteger(body.size) || Number(body.size) < 1 || Number(body.size) > 10 * 1024 * 1024) throw new ApiError(400, 'Use a processed JPEG or WebP between 1 byte and 10 MiB')
  return { organizationId: uuid(body.organizationId), contentType: body.contentType as CreatePhotoUpload['contentType'], size: Number(body.size), requestId: uuid(body.requestId) }
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new ApiError(400, 'Dates must be ISO timestamps with a timezone')
  }
  const [year, month, day, hour, minute, second] = [value.slice(0, 4), value.slice(5, 7), value.slice(8, 10), value.slice(11, 13), value.slice(14, 16), value.slice(17, 19)].map(Number)
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) throw new ApiError(400, 'Invalid calendar date')
  return new Date(value).toISOString()
}
export function createReservation(value: unknown, now?: number): CreateReservation {
  const body = object(value, ['name', 'startsAt', 'endsAt', 'equipmentIds', 'requestId'])
  const startsAt = date(body.startsAt), endsAt = date(body.endsAt)
  if ((now !== undefined && Date.parse(startsAt) < now) || Date.parse(endsAt) <= Date.parse(startsAt) || Date.parse(endsAt) - Date.parse(startsAt) > 90 * 86400_000) {
    throw new ApiError(400, 'Reservations must start in the future and last at most 90 days')
  }
  if (!Array.isArray(body.equipmentIds) || body.equipmentIds.length < 1 || body.equipmentIds.length > 50) throw new ApiError(400, 'Select 1 to 50 equipment items')
  const equipmentIds = body.equipmentIds.map(uuid).sort()
  if (new Set(equipmentIds).size !== equipmentIds.length) throw new ApiError(400, 'Equipment IDs must be unique')
  return { name: text(body.name, 120), startsAt, endsAt, equipmentIds, requestId: uuid(body.requestId) }
}
export function pagination(params: Record<string, string | undefined> = {}) {
  if (Object.keys(params).some(key => !['limit', 'after'].includes(key))) throw new ApiError(400, 'Invalid query parameters')
  if (params.limit !== undefined && !/^[1-9]\d{0,2}$/.test(params.limit)) throw new ApiError(400, 'Invalid page size')
  const limit = Number(params.limit ?? 50)
  if (limit > 100) throw new ApiError(400, 'Page size must be at most 100')
  return { limit, after: params.after === undefined ? null : uuid(params.after) }
}
