-- Indexes for tenant-scoped lookups that otherwise scan an organization's rows.
CREATE INDEX equipment_events_reservation ON app.equipment_events(organization_id, reservation_id, id) WHERE reservation_id IS NOT NULL;
CREATE INDEX equipment_events_report ON app.equipment_events(organization_id, report_id, id) WHERE report_id IS NOT NULL;
CREATE INDEX equipment_reports_equipment ON app.equipment_reports(organization_id, equipment_id);
CREATE INDEX production_attachments_brief ON app.production_attachments(organization_id, brief_id);
CREATE INDEX organization_audit_page ON app.organization_audit_events(organization_id, id);
CREATE INDEX reservation_owner_page ON app.reservations(organization_id, user_id, id);
CREATE INDEX reservation_client_account ON app.reservations(organization_id, client_account_id) WHERE client_account_id IS NOT NULL;
CREATE INDEX production_briefs_client_account ON app.production_briefs(organization_id, client_account_id) WHERE client_account_id IS NOT NULL;
