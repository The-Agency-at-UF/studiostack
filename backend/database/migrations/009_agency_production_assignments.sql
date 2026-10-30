CREATE TABLE app.client_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES app.organizations(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 archived_at timestamptz,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX client_accounts_name ON app.client_accounts(organization_id,lower(btrim(name)));
ALTER TABLE app.client_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_accounts_org ON app.client_accounts USING(organization_id::text=current_setting('app.organization_id',true)) WITH CHECK(organization_id::text=current_setting('app.organization_id',true));
ALTER TABLE app.production_briefs ADD COLUMN client_account_id uuid;
ALTER TABLE app.production_briefs ADD FOREIGN KEY(organization_id,client_account_id) REFERENCES app.client_accounts(organization_id,id);
INSERT INTO app.client_accounts(organization_id,name)
 SELECT organization_id,min(btrim(data->>'client')) FROM app.production_briefs WHERE length(btrim(data->>'client'))>0 GROUP BY organization_id,lower(btrim(data->>'client'));
UPDATE app.production_briefs b SET client_account_id=c.id,data=jsonb_set(b.data,'{clientAccountId}',to_jsonb(c.id)) FROM app.client_accounts c WHERE c.organization_id=b.organization_id AND lower(btrim(c.name))=lower(btrim(b.data->>'client'));
CREATE TABLE app.production_assignments (
 organization_id uuid NOT NULL,
 brief_id uuid NOT NULL,
 user_id uuid NOT NULL,
 role text NOT NULL CHECK(length(btrim(role)) BETWEEN 1 AND 80),
 assigned_by uuid NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,brief_id,user_id),
 FOREIGN KEY(organization_id,brief_id) REFERENCES app.production_briefs(organization_id,id),
 FOREIGN KEY(organization_id,user_id) REFERENCES app.organization_memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,assigned_by) REFERENCES app.organization_memberships(organization_id,user_id)
);
CREATE INDEX production_assignments_member ON app.production_assignments(organization_id,user_id,brief_id);
ALTER TABLE app.production_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_assignments_org ON app.production_assignments USING(organization_id::text=current_setting('app.organization_id',true)) WITH CHECK(organization_id::text=current_setting('app.organization_id',true));
ALTER TABLE app.user_alerts DROP CONSTRAINT user_alerts_kind_check;
ALTER TABLE app.user_alerts ADD CONSTRAINT user_alerts_kind_check CHECK(kind IN ('overdue_equipment','report_update','reservation_conflict','production_assignment'));
ALTER TABLE app.user_alerts DROP CONSTRAINT user_alerts_target_path_check;
ALTER TABLE app.user_alerts ADD CONSTRAINT user_alerts_target_path_check CHECK(target_path ~ '^/(report-summary|reservations|check-in-out)/[?](report|reservation)=[a-f0-9-]{36}$' OR target_path ~ '^/production/[?]brief=[a-f0-9-]{36}$');
REVOKE ALL ON app.client_accounts,app.production_assignments FROM PUBLIC;
ALTER TABLE app.reservations ADD COLUMN client_account_id uuid;
ALTER TABLE app.reservations ADD FOREIGN KEY(organization_id,client_account_id) REFERENCES app.client_accounts(organization_id,id);
