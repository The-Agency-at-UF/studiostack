-- Previously leased rows may already have reached a provider. Keep them uncertain on expiry.
ALTER TABLE app.production_outbox ADD COLUMN send_started_at timestamptz;
UPDATE app.production_outbox SET send_started_at=now() WHERE status='sending';
ALTER TABLE app.user_alerts ADD COLUMN send_started_at timestamptz;
UPDATE app.user_alerts SET send_started_at=now() WHERE email_status='sending';
ALTER TABLE app.bug_reports ADD COLUMN send_started_at timestamptz;
UPDATE app.bug_reports SET send_started_at=now() WHERE email_status='sending';
ALTER TABLE app.organization_invitations ADD COLUMN send_started_at timestamptz;
UPDATE app.organization_invitations SET send_started_at=now() WHERE delivery_status='sending';
