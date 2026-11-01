-- Self-service ways for a verified account to reach its organization. Every
-- join is decided by the IAM-only directory task against the Cognito-verified
-- email; nothing here trusts an email or organization supplied over HTTP.

-- One organization owns a verified email domain. Free-mail domains are refused
-- by the API, and only an owner on that domain may register it.
CREATE TABLE app.organization_domains (
  domain text PRIMARY KEY CHECK (domain = lower(domain) AND length(domain) <= 253 AND domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  auto_join boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, domain),
  FOREIGN KEY (organization_id, created_by) REFERENCES app.organization_memberships(organization_id, user_id)
);
ALTER TABLE app.organization_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_domains_org ON app.organization_domains USING (organization_id::text = current_setting('app.organization_id',true)) WITH CHECK (organization_id::text = current_setting('app.organization_id',true));

-- Shareable member codes. Only the SHA-256 of the code is stored; the code is
-- shown once when created. Codes always grant the member role.
CREATE TABLE app.organization_join_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  max_uses integer CHECK (max_uses BETWEEN 1 AND 10000),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0 AND (max_uses IS NULL OR uses <= max_uses)),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES app.organization_memberships(organization_id, user_id),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);
ALTER TABLE app.organization_join_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_join_codes_org ON app.organization_join_codes USING (organization_id::text = current_setting('app.organization_id',true)) WITH CHECK (organization_id::text = current_setting('app.organization_id',true));

-- Failed code entries per account, for rate limiting guesses. Not tenant data.
CREATE TABLE app.join_code_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id),
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX join_code_attempts_recent ON app.join_code_attempts(user_id, attempted_at);

-- Requests from verified accounts that matched an organization's domain but
-- were not auto-joined. Administrators approve or deny.
CREATE TABLE app.organization_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  user_id uuid NOT NULL REFERENCES app.users(id),
  message text CHECK (message IS NULL OR length(message) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','withdrawn')),
  decided_by uuid,
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, decided_by) REFERENCES app.organization_memberships(organization_id, user_id),
  CHECK ((status IN ('approved','denied')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE UNIQUE INDEX access_request_pending ON app.organization_access_requests(organization_id, user_id) WHERE status = 'pending';
CREATE INDEX access_request_user ON app.organization_access_requests(user_id, status);
ALTER TABLE app.organization_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_access_requests_org ON app.organization_access_requests USING (organization_id::text = current_setting('app.organization_id',true)) WITH CHECK (organization_id::text = current_setting('app.organization_id',true));

REVOKE ALL ON app.organization_domains, app.organization_join_codes, app.join_code_attempts, app.organization_access_requests FROM PUBLIC;
