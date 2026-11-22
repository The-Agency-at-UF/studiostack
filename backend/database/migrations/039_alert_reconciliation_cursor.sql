CREATE TABLE app.alert_reconciliation_cursor (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  organization_id uuid,
  reservation_after uuid,
  brief_after uuid
);

CREATE INDEX reservations_alert_sweep ON app.reservations(organization_id,id)
  WHERE status='confirmed' AND fulfillment_status IN ('reserved','checked_out');
CREATE INDEX production_briefs_alert_sweep ON app.production_briefs(organization_id,id)
  WHERE deleted_at IS NULL AND status IN ('submitted','changes_requested','approved');
