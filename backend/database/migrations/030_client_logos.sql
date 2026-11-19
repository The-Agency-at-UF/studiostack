ALTER TABLE app.client_accounts ADD COLUMN logo_photo_id uuid;
ALTER TABLE app.client_accounts ADD FOREIGN KEY(organization_id,logo_photo_id) REFERENCES app.photo_uploads(organization_id,id);
