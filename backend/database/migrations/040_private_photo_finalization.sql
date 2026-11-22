ALTER TABLE app.photo_uploads ADD COLUMN finalization_started_at timestamptz;
-- A pending row from the older writer may already have final bytes.
UPDATE app.photo_uploads SET finalization_started_at=now() WHERE status='pending';

CREATE OR REPLACE FUNCTION app.purge_expired_rows(OUT deleted_photo_uploads integer, OUT deleted_join_code_attempts integer, OUT deleted_read_alerts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Abandoned uploads; staging objects expire through the bucket lifecycle rule.
  DELETE FROM app.photo_uploads p WHERE p.status = 'pending' AND p.expires_at < now() - interval '7 days' AND p.finalization_started_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM app.inventory i WHERE i.organization_id = p.organization_id AND i.photo_id = p.id);
  GET DIAGNOSTICS deleted_photo_uploads = ROW_COUNT;
  -- Join-code rate limiting only looks back one hour.
  DELETE FROM app.join_code_attempts WHERE attempted_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_join_code_attempts = ROW_COUNT;
  DELETE FROM app.user_alerts WHERE read_at < now() - interval '180 days' AND email_status NOT IN ('pending', 'sending');
  GET DIAGNOSTICS deleted_read_alerts = ROW_COUNT;
END $$;
