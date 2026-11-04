-- Existing reports stay unsent; only reports submitted after this migration are emailed.
ALTER TABLE app.bug_reports
 ADD COLUMN email_status text NOT NULL DEFAULT 'skipped' CHECK(email_status IN ('skipped','pending','sending','sent','failed','uncertain','suppressed')),
 ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN lease_token uuid,
 ADD COLUMN lease_until timestamptz,
 ADD COLUMN sent_at timestamptz,
 ADD CONSTRAINT bug_reports_lease CHECK((email_status='sending' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (email_status<>'sending' AND lease_token IS NULL AND lease_until IS NULL));
ALTER TABLE app.bug_reports ALTER COLUMN email_status SET DEFAULT 'pending';
CREATE INDEX bug_reports_delivery ON app.bug_reports(organization_id,next_attempt_at) WHERE email_status='pending';
