-- Access tokens need not carry an email claim. Identity is issuer + subject,
-- never a caller-supplied email. Verified email enrichment is separate work.
ALTER TABLE app.users ALTER COLUMN email DROP NOT NULL;

CREATE TABLE app.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  equipment_code text NOT NULL CHECK (equipment_code ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('Camera & Accessories', 'Lights', 'Production Design', 'Audio', 'Cables & Cords', 'Miscellaneous')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, equipment_code)
);
CREATE INDEX inventory_org_page ON app.inventory(organization_id, id);

CREATE TABLE app.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  request_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '90 days'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, user_id, request_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_memberships(organization_id, user_id)
);
CREATE INDEX reservation_org_page ON app.reservations(organization_id, id);
CREATE INDEX reservation_org_dates ON app.reservations(organization_id, starts_at, ends_at) WHERE status = 'confirmed';

CREATE TABLE app.reservation_items (
  organization_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  equipment_id uuid NOT NULL,
  PRIMARY KEY (organization_id, reservation_id, equipment_id),
  FOREIGN KEY (organization_id, reservation_id) REFERENCES app.reservations(organization_id, id),
  FOREIGN KEY (organization_id, equipment_id) REFERENCES app.inventory(organization_id, id)
);
CREATE INDEX reservation_equipment_lookup ON app.reservation_items(organization_id, equipment_id, reservation_id);

-- Defense in depth: API sets this transaction-local value only after checking
-- an active membership against the trusted identity. Runtime is not an owner.
ALTER TABLE app.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reservation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_group_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_org ON app.inventory USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY reservations_org ON app.reservations USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY reservation_items_org ON app.reservation_items USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY groups_org ON app.user_groups USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
CREATE POLICY group_memberships_org ON app.user_group_memberships USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
REVOKE ALL ON SCHEMA app FROM PUBLIC;
