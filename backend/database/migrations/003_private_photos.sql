-- Uploads land in a staging prefix; only server-validated/re-encoded objects
-- may become inventory photos. No public URLs or browser-supplied S3 keys.
CREATE TABLE app.photo_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations(id),
  uploaded_by uuid NOT NULL,
  request_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/webp')),
  input_size integer NOT NULL CHECK (input_size BETWEEN 1 AND 10485760),
  staging_key text NOT NULL UNIQUE,
  object_key text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  width integer CHECK (width BETWEEN 1 AND 2560),
  height integer CHECK (height BETWEEN 1 AND 2560),
  stored_size integer CHECK (stored_size BETWEEN 1 AND 10485760),
  sha256 text CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, uploaded_by, request_id),
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES app.organization_memberships(organization_id, user_id),
  CHECK (status <> 'ready' OR (object_key IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND stored_size IS NOT NULL AND sha256 IS NOT NULL))
);
ALTER TABLE app.photo_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY photos_org ON app.photo_uploads USING (organization_id::text = current_setting('app.organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.organization_id', true));
ALTER TABLE app.inventory ADD COLUMN photo_id uuid;
ALTER TABLE app.inventory ADD CONSTRAINT inventory_photo_org FOREIGN KEY (organization_id, photo_id) REFERENCES app.photo_uploads(organization_id, id);
CREATE UNIQUE INDEX inventory_photo_attachment ON app.inventory(organization_id, photo_id) WHERE photo_id IS NOT NULL;
