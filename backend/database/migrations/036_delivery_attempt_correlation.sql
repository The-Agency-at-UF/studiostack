ALTER TABLE app.production_outbox ADD COLUMN send_attempt_id uuid;
ALTER TABLE app.user_alerts ADD COLUMN send_attempt_id uuid;
ALTER TABLE app.bug_reports ADD COLUMN send_attempt_id uuid;
ALTER TABLE app.organization_invitations ADD COLUMN send_attempt_id uuid;
ALTER TABLE app.email_feedback_events ADD COLUMN attempt_id uuid;
