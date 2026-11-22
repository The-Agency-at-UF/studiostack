CREATE INDEX organization_search_attempts_expiry ON app.organization_search_attempts(attempted_at,id);

CREATE FUNCTION app.purge_expired_search_attempts() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE deleted integer;
BEGIN
  DELETE FROM app.organization_search_attempts
    WHERE id IN (SELECT id FROM app.organization_search_attempts WHERE attempted_at < now() - interval '7 days'
      ORDER BY attempted_at,id LIMIT 5000 FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END $$;
REVOKE ALL ON FUNCTION app.purge_expired_search_attempts() FROM PUBLIC;
