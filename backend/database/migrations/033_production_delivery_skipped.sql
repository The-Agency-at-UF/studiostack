ALTER TABLE app.production_outbox DROP CONSTRAINT production_outbox_status_check;
ALTER TABLE app.production_outbox ADD CONSTRAINT production_outbox_status_check
  CHECK (status IN ('pending','sending','sent','failed','uncertain','skipped'));
