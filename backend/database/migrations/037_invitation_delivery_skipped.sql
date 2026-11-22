ALTER TABLE app.organization_invitations DROP CONSTRAINT organization_invitations_delivery_status_check;
ALTER TABLE app.organization_invitations ADD CONSTRAINT organization_invitations_delivery_status_check
  CHECK (delivery_status IN ('queued','sending','sent','failed','uncertain','skipped'));
