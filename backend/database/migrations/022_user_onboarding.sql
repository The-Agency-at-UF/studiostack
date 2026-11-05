-- First-run onboarding. Accounts that already exist are treated as onboarded;
-- new accounts finish once they hold an active membership.
ALTER TABLE app.users ADD COLUMN onboarded_at timestamptz;
UPDATE app.users SET onboarded_at = created_at;

-- Shown under the name in onboarding search, e.g. "Gainesville".
ALTER TABLE app.organizations ADD COLUMN location text CHECK (location IS NULL OR length(location) BETWEEN 1 AND 80);

-- Organization searches per account, for rate limiting. Not tenant data.
CREATE TABLE app.organization_search_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id),
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_search_attempts_recent ON app.organization_search_attempts(user_id, attempted_at);
