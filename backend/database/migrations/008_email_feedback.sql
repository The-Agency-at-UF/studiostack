-- Store delivery metadata and normalized recipient hashes, never raw SES bodies.
CREATE TABLE app.email_feedback_events (
 id uuid PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('bounce','complaint')),
 receipt_hash text NOT NULL CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 delivery_id uuid,
 invitation_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_feedback_delivery ON app.email_feedback_events(delivery_id) WHERE delivery_id IS NOT NULL;
CREATE INDEX email_feedback_invitation ON app.email_feedback_events(invitation_id) WHERE invitation_id IS NOT NULL;
CREATE TABLE app.email_suppressions (
 email_hash text PRIMARY KEY CHECK(email_hash ~ '^[a-f0-9]{64}$'),
 reason text NOT NULL CHECK(reason IN ('bounce','complaint')),
 event_id uuid NOT NULL REFERENCES app.email_feedback_events(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app.email_feedback_events,app.email_suppressions FROM PUBLIC;
