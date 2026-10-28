CREATE TABLE app.alert_preferences (
 organization_id uuid NOT NULL,
 user_id uuid NOT NULL,
 equipment_email boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(organization_id,user_id),
 FOREIGN KEY(organization_id,user_id) REFERENCES app.organization_memberships(organization_id,user_id)
);
CREATE TABLE app.user_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 recipient_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('overdue_equipment','report_update','reservation_conflict')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 1000),
 target_path text NOT NULL CHECK(target_path ~ '^/(report-summary|reservations|check-in-out)/[?](report|reservation)=[a-f0-9-]{36}$'),
 dedupe_key text NOT NULL CHECK(length(dedupe_key) BETWEEN 1 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 email_status text NOT NULL DEFAULT 'skipped' CHECK(email_status IN ('skipped','pending','sending','sent','failed','uncertain','suppressed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 sent_at timestamptz,
 UNIQUE(organization_id,recipient_id,dedupe_key),
 FOREIGN KEY(organization_id,recipient_id) REFERENCES app.organization_memberships(organization_id,user_id),
 CHECK((email_status='sending' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (email_status<>'sending' AND lease_token IS NULL AND lease_until IS NULL))
);
CREATE INDEX user_alerts_page ON app.user_alerts(organization_id,recipient_id,id);
CREATE INDEX user_alerts_delivery ON app.user_alerts(organization_id,next_attempt_at) WHERE email_status='pending';
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['alert_preferences','user_alerts'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON app.%I USING(organization_id::text=current_setting(''app.organization_id'',true)) WITH CHECK(organization_id::text=current_setting(''app.organization_id'',true))',t||'_org',t);
 END LOOP;
END $$;
REVOKE ALL ON app.alert_preferences,app.user_alerts FROM PUBLIC;
