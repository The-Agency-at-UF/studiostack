-- production_briefs.client_account_id is the only stored copy of a brief's
-- client account; the API projects it back into data on read. Event
-- snapshots are history and keep the copy they were taken with.
UPDATE app.production_briefs SET data = data - 'clientAccountId' WHERE data ? 'clientAccountId';
