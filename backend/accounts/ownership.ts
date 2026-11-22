import type { DatabaseClient } from '../database/client'
import { ApiError } from '../database/api-validation'

export async function lockOrganizationAdministration(client: DatabaseClient, organizationId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`organization-admin:${organizationId}`])
}

/** Call under the organization's administration lock before changing an active owner. */
export async function requireAnotherActiveOwner(client: DatabaseClient, organizationId: string, userId: string, message = 'Keep at least one active organization owner') {
  const { rows } = await client.query(
    "SELECT 1 FROM app.organization_memberships WHERE organization_id=$1 AND user_id<>$2 AND role='owner' AND status='active' LIMIT 1",
    [organizationId, userId],
  )
  if (!rows.length) throw new ApiError(409, message)
}

export async function pruneProductionRoles(client: DatabaseClient, organizationId: string, userId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`production-settings:${organizationId}`])
  const result = await client.query(
    'UPDATE app.production_settings SET reviewer_ids=array_remove(reviewer_ids,$2),executive_ids=array_remove(executive_ids,$2),version=version+1 WHERE organization_id=$1 AND $2::uuid=ANY(reviewer_ids||executive_ids) RETURNING version',
    [organizationId, userId],
  )
  return result.rows.length>0
}
