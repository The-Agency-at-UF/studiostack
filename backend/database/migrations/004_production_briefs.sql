CREATE TABLE app.production_settings (
  organization_id uuid PRIMARY KEY REFERENCES app.organizations(id),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  reviewer_ids uuid[] NOT NULL DEFAULT '{}', executive_ids uuid[] NOT NULL DEFAULT '{}',
  approval_confirms_dates boolean NOT NULL DEFAULT true CHECK (approval_confirms_dates)
);
CREATE TABLE app.production_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES app.organizations(id),
  owner_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','changes_requested','approved','denied','withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), submission integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object' AND octet_length(data::text) <= 60000),
  request_id uuid NOT NULL, request_hash text NOT NULL,
  shoot_starts_at timestamptz, shoot_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id), UNIQUE (organization_id, owner_id, request_id),
  FOREIGN KEY (organization_id, owner_id) REFERENCES app.organization_memberships(organization_id, user_id),
  CHECK ((shoot_starts_at IS NULL AND shoot_ends_at IS NULL) OR (shoot_starts_at IS NOT NULL AND shoot_ends_at > shoot_starts_at AND status = 'approved'))
);
CREATE INDEX production_briefs_page ON app.production_briefs(organization_id, id);
CREATE TABLE app.production_brief_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, brief_id uuid NOT NULL,
  actor_id uuid NOT NULL, kind text NOT NULL, comment text NOT NULL DEFAULT '', section text NOT NULL DEFAULT '',
  version integer NOT NULL, request_id uuid NOT NULL, request_hash text NOT NULL,
  snapshot jsonb, attachment_snapshot jsonb NOT NULL DEFAULT '[]', shoot_starts_at timestamptz, shoot_ends_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id), UNIQUE (organization_id, brief_id, request_id),
  FOREIGN KEY (organization_id, brief_id) REFERENCES app.production_briefs(organization_id, id),
  FOREIGN KEY (organization_id, actor_id) REFERENCES app.organization_memberships(organization_id, user_id)
);
CREATE INDEX production_events_brief ON app.production_brief_events(organization_id, brief_id, version);
CREATE TABLE app.production_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, brief_id uuid NOT NULL, uploaded_by uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), content_type text NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 20971520), object_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','discarded')), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, brief_id) REFERENCES app.production_briefs(organization_id, id),
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES app.organization_memberships(organization_id, user_id)
);
CREATE TABLE app.production_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, brief_id uuid NOT NULL, event_id uuid NOT NULL,
  recipient_id uuid NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
  UNIQUE (event_id, recipient_id), FOREIGN KEY (organization_id, recipient_id) REFERENCES app.organization_memberships(organization_id, user_id), FOREIGN KEY (organization_id, event_id) REFERENCES app.production_brief_events(organization_id, id),
  FOREIGN KEY (organization_id, brief_id) REFERENCES app.production_briefs(organization_id, id)
);
CREATE INDEX production_outbox_due ON app.production_outbox(organization_id, next_attempt_at) WHERE status = 'pending';
ALTER TABLE app.production_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.production_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.production_brief_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.production_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.production_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_settings_org ON app.production_settings USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY production_briefs_org ON app.production_briefs USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY production_events_org ON app.production_brief_events USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY production_attachments_org ON app.production_attachments USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY production_outbox_org ON app.production_outbox USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
