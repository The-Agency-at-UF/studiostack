import { ApiError, object, uuid } from '../database/api-validation'
import { briefSections, productionTypes, type BriefData, type BriefCommand, type ProductionSettings } from '../../src/types/production'
const bad = (message: string): never => { throw new ApiError(400, message) }
function string(value: unknown, max = 4000): string { if (typeof value !== 'string' || value.length > max || Array.from(value).some(c => c.charCodeAt(0) < 32 && !['\t','\n','\r'].includes(c))) return bad('Invalid text or text too long'); return value.trim() }
export function version(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0) return bad('A valid record version is required'); return Number(value) }
function date(value: string) { if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) bad('Invalid calendar date'); return value }
export function briefData(input: unknown): BriefData {
  const v = object(input, ['projectName', 'client', 'managers', 'supervisor', 'deliveryDate', 'productionTypes', 'fields'])
  const fields = object(v.fields, briefSections.flatMap(s => s.fields.map(f => f.key)))
  const result: BriefData = { projectName: string(v.projectName, 160), client: string(v.client, 160), managers: string(v.managers, 500), supervisor: string(v.supervisor, 160), deliveryDate: date(string(v.deliveryDate, 10)), productionTypes: [], fields: {} }
  if (!Array.isArray(v.productionTypes) || v.productionTypes.length > 4 || new Set(v.productionTypes).size !== v.productionTypes.length || v.productionTypes.some(t => !productionTypes.includes(t))) bad('Invalid production types')
  result.productionTypes = v.productionTypes as BriefData['productionTypes']
  for (const field of briefSections.flatMap(s => s.fields)) if (fields[field.key] !== undefined) {
    const value = string(fields[field.key], field.type === 'textarea' ? 6000 : 1000)
    if (field.type === 'date') date(value)
    if (field.type === 'select' && value && !field.options?.includes(value)) bad('Invalid selection')
    if (field.type === 'url' && value) { try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) bad('Links must use HTTPS') } catch { bad('Links must use HTTPS') } }
    result.fields[field.key] = value
  }
  const start = result.fields.proposedStart, end = result.fields.proposedEnd
  if (Boolean(start) !== Boolean(end) || (start && end < start)) bad('Provide a valid start and end for the projected shoot window')
  if (end && result.deliveryDate && end > result.deliveryDate) bad('Projected shoot must finish by the target delivery date')
  for (const f of briefSections.find(s => s.title === 'Timeline')!.fields) if (result.fields[f.key] && result.deliveryDate && result.fields[f.key] > result.deliveryDate) bad('Timeline milestones must be on or before delivery')
  if (Buffer.byteLength(JSON.stringify(result)) > 48_000) bad('Brief exceeds 48 KiB')
  return result
}
export function briefCommand(input: unknown): BriefCommand {
  const v = object(input, ['action', 'version', 'requestId', 'comment', 'section', 'shootStartsAt', 'shootEndsAt'])
  if (!['submit', 'approve', 'request_changes', 'deny', 'comment', 'withdraw', 'reopen', 'schedule'].includes(String(v.action))) bad('Invalid action')
  const result: BriefCommand = { action: v.action as BriefCommand['action'], version: version(v.version), requestId: uuid(v.requestId), comment: v.comment === undefined ? '' : string(v.comment, 6000), section: v.section === undefined ? '' : string(v.section, 120) }
  if (result.section && !briefSections.some(s => s.title === result.section)) bad('Unknown brief section')
  if (['comment', 'request_changes', 'deny'].includes(result.action) && !result.comment) bad('A comment or reason is required')
  if (v.shootStartsAt !== undefined || v.shootEndsAt !== undefined) {
    if (!['schedule', 'approve'].includes(result.action)) bad('Dates are only accepted for scheduling or approval')
    for (const key of ['shootStartsAt', 'shootEndsAt'] as const) {
      if (typeof v[key] !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(v[key]) || !Number.isFinite(Date.parse(v[key]))) bad('Shoot times require valid timestamps and a timezone')
      result[key] = new Date(v[key] as string).toISOString()
    }
    if (Date.parse(result.shootEndsAt!) <= Date.parse(result.shootStartsAt!) || Date.parse(result.shootEndsAt!) - Date.parse(result.shootStartsAt!) > 31 * 86400_000) bad('Shoot end must follow start within 31 days')
  }
  if (result.action === 'schedule' && !result.shootStartsAt) bad('Confirmed shoot times are required')
  return result
}
export function productionSettings(input: unknown): ProductionSettings {
  const v = object(input, ['version', 'reviewerIds', 'executiveIds', 'approvalConfirmsDates'])
  const ids = (value: unknown) => { if (!Array.isArray(value) || value.length > 100) return bad('Invalid member list'); return [...new Set(value.map(uuid))] }
  if (v.approvalConfirmsDates !== true) bad('Choose the approval scheduling rule')
  return { version: version(v.version), reviewerIds: ids(v.reviewerIds), executiveIds: ids(v.executiveIds), approvalConfirmsDates: true }
}
