-- Fixed retention, run by the scheduled maintenance task. SECURITY DEFINER so
-- the runtime role needs only EXECUTE, never DELETE on these tables, and the
-- purge does not have to visit each organization's RLS context.
-- Kept forever: audit events, equipment history, email feedback and suppressions.
CREATE FUNCTION app.purge_expired_rows(OUT deleted_photo_uploads integer, OUT deleted_join_code_attempts integer, OUT deleted_read_alerts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Abandoned uploads; staging objects expire through the bucket lifecycle rule.
  DELETE FROM app.photo_uploads p WHERE p.status = 'pending' AND p.expires_at < now() - interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM app.inventory i WHERE i.organization_id = p.organization_id AND i.photo_id = p.id);
  GET DIAGNOSTICS deleted_photo_uploads = ROW_COUNT;
  -- Join-code rate limiting only looks back one hour.
  DELETE FROM app.join_code_attempts WHERE attempted_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_join_code_attempts = ROW_COUNT;
  DELETE FROM app.user_alerts WHERE read_at < now() - interval '180 days' AND email_status NOT IN ('pending', 'sending');
  GET DIAGNOSTICS deleted_read_alerts = ROW_COUNT;
END $$;
REVOKE ALL ON FUNCTION app.purge_expired_rows() FROM PUBLIC;
