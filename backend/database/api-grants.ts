import type { DatabaseEnvironment } from './config'

/** Maintenance-only SQL; neither HTTP requests nor runtime ever grant privileges. */
export function databaseApiGrants(environment: DatabaseEnvironment) {
  if (!['dev', 'prod'].includes(environment)) throw new Error('Explicit database environment required')
  const role = `"studiostack_${environment}_app"`
  return `
    GRANT SELECT,INSERT ON app.client_accounts,app.production_assignments TO ${role};
    GRANT UPDATE(name,archived_at,version) ON app.client_accounts TO ${role};
    GRANT DELETE ON app.production_assignments TO ${role};
    GRANT SELECT,INSERT ON app.bug_reports TO ${role};
    GRANT USAGE ON SCHEMA app TO ${role};
    GRANT SELECT,INSERT ON app.email_feedback_events,app.email_suppressions TO ${role};
    GRANT SELECT,INSERT ON app.alert_preferences,app.user_alerts TO ${role};
    GRANT UPDATE(equipment_email,version) ON app.alert_preferences TO ${role};
    GRANT UPDATE(read_at,email_status,attempts,next_attempt_at,lease_token,lease_until,sent_at) ON app.user_alerts TO ${role};
    GRANT SELECT, INSERT ON app.users TO ${role};
    GRANT UPDATE (email, display_name) ON app.users TO ${role};
    GRANT SELECT ON app.organizations, app.organization_memberships, app.user_group_memberships TO ${role};
    GRANT UPDATE (name, reservation_days, version) ON app.organizations TO ${role};
    GRANT UPDATE (role, status, version) ON app.organization_memberships TO ${role};
    GRANT UPDATE (name, archived_at, version) ON app.user_groups TO ${role};
    GRANT INSERT, DELETE ON app.user_group_memberships TO ${role};
    GRANT SELECT, INSERT ON app.organization_audit_events TO ${role};
    GRANT SELECT, INSERT ON app.organization_invitations TO ${role};
    GRANT UPDATE (status, accepted_by, accepted_at, version, delivery_status, attempts, next_attempt_at, lease_token, lease_until, delivered_at) ON app.organization_invitations TO ${role};
    GRANT INSERT ON app.organization_memberships TO ${role};
    GRANT SELECT, INSERT, DELETE ON app.organization_domains TO ${role};
    GRANT UPDATE (auto_join, version) ON app.organization_domains TO ${role};
    GRANT SELECT, INSERT ON app.organization_join_codes TO ${role};
    GRANT UPDATE (uses, revoked_at, version) ON app.organization_join_codes TO ${role};
    GRANT SELECT, INSERT ON app.join_code_attempts TO ${role};
    GRANT SELECT, INSERT ON app.organization_access_requests TO ${role};
    GRANT UPDATE (status, decided_by, decided_at, version) ON app.organization_access_requests TO ${role};
    GRANT SELECT, INSERT ON app.user_groups, app.inventory, app.reservations, app.reservation_items TO ${role};
    GRANT UPDATE (name, category, status, photo_id,condition,version) ON app.inventory TO ${role};
    GRANT UPDATE (client_account_id,name,starts_at,ends_at,status,version,fulfillment_status,checked_out_at,returned_at) ON app.reservations TO ${role};
    GRANT DELETE ON app.reservation_items TO ${role};
    GRANT SELECT,INSERT ON app.equipment_checkouts,app.equipment_reports,app.equipment_events TO ${role};
    GRANT UPDATE(status,resolution,resolved_by,resolved_at,updated_at,version) ON app.equipment_reports TO ${role};
    GRANT UPDATE(returned_by,returned_at,return_condition,return_notes) ON app.equipment_checkouts TO ${role};
    GRANT SELECT, INSERT ON app.production_settings, app.production_briefs, app.production_brief_events, app.production_attachments, app.production_outbox TO ${role};
    GRANT UPDATE (version, reviewer_ids, executive_ids, approval_confirms_dates) ON app.production_settings TO ${role};
    GRANT UPDATE (client_account_id,data, status, version, submission, shoot_starts_at, shoot_ends_at, updated_at) ON app.production_briefs TO ${role};
    GRANT UPDATE (status) ON app.production_attachments TO ${role};
    GRANT UPDATE (status, attempts, next_attempt_at, lease_token, lease_until, sent_at) ON app.production_outbox TO ${role};
    GRANT SELECT, INSERT ON app.photo_uploads TO ${role};
    GRANT UPDATE (status, object_key, width, height, stored_size, sha256) ON app.photo_uploads TO ${role};
  `
}
