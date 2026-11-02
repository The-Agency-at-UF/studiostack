-- Bring the production tables to the same checks as the later outbox and
-- request tables. Kinds are every value the brief workflow has ever written.
ALTER TABLE app.production_briefs ADD CONSTRAINT production_briefs_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE app.production_brief_events ADD CONSTRAINT production_brief_events_request_hash_check CHECK (request_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE app.production_brief_events ADD CONSTRAINT production_brief_events_kind_check CHECK (kind IN (
  'created','saved','submitted','approved','changes_requested','denied','scheduled','withdrawn','reopened','commented',
  'crew_assigned','attachment_added','attachment_removed'
));
ALTER TABLE app.production_outbox ADD CONSTRAINT production_outbox_attempts_check CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE app.production_outbox ADD CONSTRAINT production_outbox_lease_check CHECK (
  (status = 'sending' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR
  (status <> 'sending' AND lease_token IS NULL AND lease_until IS NULL)
);
