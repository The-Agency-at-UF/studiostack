CREATE TABLE app.bug_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 reported_by uuid NOT NULL,
 request_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 4000),
 page_path text NOT NULL CHECK(length(page_path) BETWEEN 1 AND 255 AND left(page_path,1)='/'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,reported_by,request_id),
 FOREIGN KEY(organization_id,reported_by) REFERENCES app.organization_memberships(organization_id,user_id)
);
ALTER TABLE app.bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY bug_reports_org ON app.bug_reports USING(organization_id::text=current_setting('app.organization_id',true)) WITH CHECK(organization_id::text=current_setting('app.organization_id',true));
REVOKE ALL ON app.bug_reports FROM PUBLIC;
