-- Authors delete never-submitted drafts by marking them; the runtime role
-- keeps no DELETE on briefs, so brief history stays append-only.
ALTER TABLE app.production_briefs ADD COLUMN deleted_at timestamptz;
ALTER TABLE app.production_briefs ADD CHECK (deleted_at IS NULL OR (status = 'draft' AND submission = 0));
