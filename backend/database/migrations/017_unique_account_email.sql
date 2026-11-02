-- One StudioStack account per verified email in a sign-in pool. Cognito uses
-- the email as a case-insensitive username, so a second account for the same
-- email only appears when a sign-in is deleted and created again, or when an
-- email moves to a new sign-in. app.claim_account_email resolves both.
UPDATE app.users SET email = lower(btrim(email)) WHERE email IS NOT NULL AND email <> lower(btrim(email));
-- Earlier rows could share an email. Keep it on the account holding the most
-- memberships (then the oldest). The others get an email again only through
-- app.claim_account_email, the next time their sign-in uses the directory.
WITH ranked AS (
  SELECT u.id, row_number() OVER (
    PARTITION BY u.cognito_issuer, u.email
    ORDER BY (SELECT count(*) FROM app.organization_memberships m WHERE m.user_id = u.id) DESC, u.created_at, u.id
  ) AS n
  FROM app.users u WHERE u.email IS NOT NULL
)
UPDATE app.users u SET email = NULL FROM ranked r WHERE r.id = u.id AND r.n > 1;
ALTER TABLE app.users ADD CONSTRAINT users_email_lowercase CHECK (email IS NULL OR email = lower(email));
CREATE UNIQUE INDEX users_issuer_email ON app.users(cognito_issuer, email) WHERE email IS NOT NULL;

-- Called only by the IAM-only directory task, with an email Cognito has
-- verified for p_subject. When another account already holds the email, the
-- caller must first ask Cognito about that account's sign-in:
--   'deleted': the sign-in is gone, so this sign-in takes over that account and
--              its memberships and history (the same trust invitations use);
--   'active':  the sign-in still exists under a different email, so the stored
--              email is stale and moves to this sign-in's own account.
-- Without a matching answer it returns the other sign-in's subject to ask about.
CREATE FUNCTION app.claim_account_email(p_issuer text, p_subject text, p_email text, p_previous_subject text, p_previous_state text,
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
  -- The row this sign-in registered is dropped only while it holds nothing of
  -- its own; otherwise two real accounts need an administrator to merge them.
  BEGIN
    UPDATE app.join_code_attempts a SET user_id = holder_id WHERE a.user_id = signed_in;
    DELETE FROM app.users u WHERE u.id = signed_in;
  EXCEPTION WHEN foreign_key_violation THEN
    merge_blocked := true; RETURN;
  END;
  UPDATE app.users u SET cognito_subject = p_subject WHERE u.id = holder_id;
  account_id := holder_id;
END $$;
REVOKE ALL ON FUNCTION app.claim_account_email(text, text, text, text, text) FROM PUBLIC;
