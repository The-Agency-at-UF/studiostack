CREATE OR REPLACE FUNCTION app.claim_account_email(p_issuer text, p_subject text, p_email text, p_previous_subject text, p_previous_state text,
  OUT account_id uuid, OUT conflicting_subject text, OUT merge_blocked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE signed_in uuid; holder_id uuid; holder_subject text;
BEGIN
  merge_blocked := false;
  IF p_email IS NULL OR p_email <> lower(btrim(p_email)) OR p_previous_state NOT IN ('deleted', 'active') THEN
    RAISE EXCEPTION 'invalid account email claim' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account-email:' || p_issuer || ':' || p_email, 0));
  SELECT u.id INTO signed_in FROM app.users u WHERE u.cognito_issuer = p_issuer AND u.cognito_subject = p_subject FOR UPDATE;
  IF signed_in IS NULL THEN RETURN; END IF;
  SELECT u.id, u.cognito_subject INTO holder_id, holder_subject FROM app.users u
    WHERE u.cognito_issuer = p_issuer AND u.email = p_email AND u.id <> signed_in FOR UPDATE;
  IF holder_id IS NULL THEN
    UPDATE app.users u SET email = p_email WHERE u.id = signed_in AND u.email IS DISTINCT FROM p_email;
    account_id := signed_in; RETURN;
  END IF;
  IF p_previous_subject IS DISTINCT FROM holder_subject THEN
    conflicting_subject := holder_subject; RETURN;
  END IF;
  IF p_previous_state = 'active' THEN
    UPDATE app.users u SET email = NULL WHERE u.id = holder_id;
    UPDATE app.users u SET email = p_email WHERE u.id = signed_in;
    account_id := signed_in; RETURN;
  END IF;
  -- A deleted provider identity cannot prove continuity of the person.
  -- Leave both subjects, profiles, memberships and history intact.
  merge_blocked := true;
END $$;
