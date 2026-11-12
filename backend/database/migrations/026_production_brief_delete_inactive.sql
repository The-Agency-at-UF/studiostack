-- Owners, administrators and authors may delete any inactive brief (a draft,
-- or a denied or withdrawn request), not only never-submitted drafts. Deleting
-- still only marks the row, so submitted history stays append-only. Active
-- requests (submitted, approved, changes requested) must be withdrawn first.
-- Migration 020 added its check without a name, so find it by definition.
DO $$
DECLARE previous text;
BEGIN
  SELECT conname INTO previous FROM pg_constraint
  WHERE conrelid = 'app.production_briefs'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%deleted_at IS NULL%';
  IF previous IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.production_briefs DROP CONSTRAINT %I', previous);
  END IF;
END $$;
ALTER TABLE app.production_briefs ADD CONSTRAINT production_briefs_deleted_inactive
  CHECK (deleted_at IS NULL OR status IN ('draft', 'denied', 'withdrawn'));
