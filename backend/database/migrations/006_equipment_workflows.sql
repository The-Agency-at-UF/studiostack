ALTER TABLE app.inventory ADD COLUMN condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('excellent','good','fair','damaged'));
ALTER TABLE app.inventory ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);
ALTER TABLE app.reservations ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version>0);
ALTER TABLE app.reservations ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'reserved' CHECK (fulfillment_status IN ('reserved','checked_out','returned'));
ALTER TABLE app.reservations ADD COLUMN checked_out_at timestamptz;
ALTER TABLE app.reservations ADD COLUMN returned_at timestamptz;
ALTER TABLE app.reservations ADD CONSTRAINT reservation_fulfillment_dates CHECK (
  (fulfillment_status='reserved' AND checked_out_at IS NULL AND returned_at IS NULL) OR
  (fulfillment_status='checked_out' AND checked_out_at IS NOT NULL AND returned_at IS NULL AND status='confirmed') OR
  (fulfillment_status='returned' AND checked_out_at IS NOT NULL AND returned_at IS NOT NULL AND returned_at>=checked_out_at AND status='confirmed')
);

CREATE TABLE app.equipment_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  checked_out_by uuid NOT NULL,
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  checkout_condition text NOT NULL CHECK (checkout_condition IN ('excellent','good','fair','damaged')),
  checkout_notes text NOT NULL DEFAULT '' CHECK (length(checkout_notes)<=1000),
  returned_by uuid,
  returned_at timestamptz,
  return_condition text CHECK (return_condition IN ('excellent','good','fair','damaged')),
  return_notes text NOT NULL DEFAULT '' CHECK (length(return_notes)<=1000),
  CHECK ((returned_at IS NULL AND returned_by IS NULL AND return_condition IS NULL) OR (returned_at IS NOT NULL AND returned_at>=checked_out_at AND returned_by IS NOT NULL AND return_condition IS NOT NULL)),
  UNIQUE(organization_id,id),
  UNIQUE(organization_id,reservation_id,equipment_id),
  FOREIGN KEY(organization_id,reservation_id) REFERENCES app.reservations(organization_id,id),
  FOREIGN KEY(organization_id,equipment_id) REFERENCES app.inventory(organization_id,id),
  FOREIGN KEY(organization_id,checked_out_by) REFERENCES app.organization_memberships(organization_id,user_id),
  FOREIGN KEY(organization_id,returned_by) REFERENCES app.organization_memberships(organization_id,user_id)
);
CREATE UNIQUE INDEX equipment_single_checkout ON app.equipment_checkouts(organization_id,equipment_id) WHERE returned_at IS NULL;

CREATE TABLE app.equipment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  reservation_id uuid,
  reported_by uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 4000),
  severity text NOT NULL CHECK (severity IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  resolution text NOT NULL DEFAULT '' CHECK (length(resolution)<=4000),
  resolved_by uuid,
  resolved_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='resolved' AND length(resolution)>0 AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL) OR (status<>'resolved' AND resolved_by IS NULL AND resolved_at IS NULL)),
  UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,equipment_id) REFERENCES app.inventory(organization_id,id),
  FOREIGN KEY(organization_id,reservation_id) REFERENCES app.reservations(organization_id,id),
  FOREIGN KEY(organization_id,reported_by) REFERENCES app.organization_memberships(organization_id,user_id),
  FOREIGN KEY(organization_id,resolved_by) REFERENCES app.organization_memberships(organization_id,user_id)
);
CREATE INDEX equipment_reports_org_page ON app.equipment_reports(organization_id,id);

CREATE TABLE app.equipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  reservation_id uuid,
  equipment_id uuid,
  report_id uuid,
  kind text NOT NULL CHECK (kind IN ('reservation_edited','checked_out','returned','report_created','report_updated','report_comment','item_condition_updated')),
  details jsonb NOT NULL DEFAULT '{}' CHECK (octet_length(details::text)<=65536),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,actor_id,request_id),
  FOREIGN KEY(organization_id,actor_id) REFERENCES app.organization_memberships(organization_id,user_id),
  FOREIGN KEY(organization_id,reservation_id) REFERENCES app.reservations(organization_id,id),
  FOREIGN KEY(organization_id,equipment_id) REFERENCES app.inventory(organization_id,id),
  FOREIGN KEY(organization_id,report_id) REFERENCES app.equipment_reports(organization_id,id)
);
CREATE INDEX equipment_events_org_page ON app.equipment_events(organization_id,id);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['equipment_checkouts','equipment_reports','equipment_events'] LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON app.%I USING (organization_id::text=current_setting(''app.organization_id'',true)) WITH CHECK (organization_id::text=current_setting(''app.organization_id'',true))',t||'_org',t);
  END LOOP;
END $$;
REVOKE ALL ON app.equipment_checkouts,app.equipment_reports,app.equipment_events FROM PUBLIC;
