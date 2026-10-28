ALTER TABLE app.organizations ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE app.organizations ADD COLUMN reservation_days integer NOT NULL DEFAULT 7 CHECK (reservation_days BETWEEN 1 AND 90);
ALTER TABLE app.organization_memberships ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE app.user_groups ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE app.user_groups ADD COLUMN archived_at timestamptz;

CREATE TABLE app.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  role text NOT NULL CHECK (role IN ('admin','member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  created_by uuid NOT NULL,
  accepted_by uuid REFERENCES app.users(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  delivery_status text NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued','sending','sent','failed','uncertain')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,created_by,request_id),
  FOREIGN KEY (organization_id,created_by) REFERENCES app.organization_memberships(organization_id,user_id),
  CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX invitation_pending_email ON app.organization_invitations(organization_id,email) WHERE status = 'pending';
CREATE INDEX invitation_delivery_queue ON app.organization_invitations(next_attempt_at,id) WHERE status = 'pending' AND delivery_status = 'queued';
CREATE INDEX invitation_recipient_lookup ON app.organization_invitations(email,status);
ALTER TABLE app.organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_org ON app.organization_invitations USING (organization_id::text = current_setting('app.organization_id',true)) WITH CHECK (organization_id::text = current_setting('app.organization_id',true));

CREATE TABLE app.organization_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  actor_id uuid NOT NULL,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 60),
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,actor_id,request_id),
  FOREIGN KEY (organization_id,actor_id) REFERENCES app.organization_memberships(organization_id,user_id)
);
ALTER TABLE app.organization_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_audit_org ON app.organization_audit_events USING (organization_id::text = current_setting('app.organization_id',true)) WITH CHECK (organization_id::text = current_setting('app.organization_id',true));
