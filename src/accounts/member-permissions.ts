import type { ApiOrganization } from '../types/database-api'

type Role = ApiOrganization['role']

/** Access changes use the saved role, so a demotion in the same request cannot bypass this check. */
export function canChangeMemberAccess(actor: Role, target: Role) {
  return target !== 'owner' && (actor === 'owner' || actor === 'admin' && target === 'member')
}
