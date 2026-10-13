-- Identical schema for dev/prod. No demo users, seed admins or credentials.
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_issuer text NOT NULL,
  cognito_subject text NOT NULL,
  email text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cognito_issuer, cognito_subject),
  CHECK (length(cognito_subject) BETWEEN 1 AND 256)
);

CREATE TABLE app.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.organization_memberships (
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  user_id uuid NOT NULL REFERENCES app.users(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL CHECK (status IN ('invited', 'active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX membership_user_lookup ON app.organization_memberships(user_id, status);

-- Organization-local equipment/access groups; not Cognito platform groups.
CREATE TABLE app.user_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);
CREATE TABLE app.user_group_memberships (
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (organization_id, group_id, user_id),
  FOREIGN KEY (organization_id, group_id) REFERENCES app.user_groups(organization_id, id),
  FOREIGN KEY (organization_id, user_id) REFERENCES app.organization_memberships(organization_id, user_id)
);

-- Role and membership edits are intentionally not exposed here. A future API
-- must authorize every request against the verified identity and target org;
-- foreign keys alone do not establish tenant authorization.
