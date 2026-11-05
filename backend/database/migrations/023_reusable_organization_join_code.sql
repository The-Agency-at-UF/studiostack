-- Only the dedicated reusable organization code is retained for admin display.
-- Ordinary codes remain hash-only. Existing tenant RLS and admin API checks apply.
ALTER TABLE app.organization_join_codes ADD COLUMN display_code text;
ALTER TABLE app.organization_join_codes ADD CONSTRAINT organization_display_code_format
  CHECK (display_code IS NULL OR (display_code ~ '^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$' AND max_uses IS NULL AND expires_at IS NULL));
CREATE UNIQUE INDEX organization_one_reusable_join_code
  ON app.organization_join_codes (organization_id)
  WHERE display_code IS NOT NULL AND revoked_at IS NULL;
