-- A workspace logo is a completed private photo of that organization. The
-- object key is copied onto the organization so membership lists across many
-- organizations can sign it without reading another organization's photo rows.
ALTER TABLE app.organizations
 ADD COLUMN logo_photo_id uuid,
 ADD COLUMN logo_key text CHECK (logo_key ~ '^photos/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
 ADD CONSTRAINT organizations_logo_photo FOREIGN KEY (id, logo_photo_id) REFERENCES app.photo_uploads(organization_id, id),
 ADD CONSTRAINT organizations_logo_pair CHECK ((logo_photo_id IS NULL) = (logo_key IS NULL));
