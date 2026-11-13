-- Client accounts are deleted instead of archived. Deleting only marks the
-- row, so reservations and briefs keep pointing at it and can be restored
-- with their grouping intact. Owners, administrators and the person who
-- created an account may delete or restore it. Accounts created before this
-- migration have no recorded creator, so only owners and administrators
-- manage those. archived_at is no longer written and is dropped later, once
-- no running API version reads it.
ALTER TABLE app.client_accounts
  ADD COLUMN created_by uuid,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid;
UPDATE app.client_accounts SET deleted_at = archived_at WHERE archived_at IS NOT NULL;
