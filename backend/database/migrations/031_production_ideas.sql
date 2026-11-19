CREATE TABLE app.production_ideas (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES app.organizations(id),
 author_id uuid NOT NULL,
 client_account_id uuid,
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 pitch text NOT NULL CHECK(length(btrim(pitch)) BETWEEN 1 AND 6000),
 status text NOT NULL DEFAULT 'idea' CHECK(status IN ('idea','pitched','selected','archived')),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,author_id) REFERENCES app.organization_memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,client_account_id) REFERENCES app.client_accounts(organization_id,id)
);
CREATE INDEX production_ideas_page ON app.production_ideas(organization_id,id);
ALTER TABLE app.production_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY production_ideas_org ON app.production_ideas USING(organization_id::text=current_setting('app.organization_id',true)) WITH CHECK(organization_id::text=current_setting('app.organization_id',true));
REVOKE ALL ON app.production_ideas FROM PUBLIC;
