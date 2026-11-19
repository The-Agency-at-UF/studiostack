ALTER TABLE app.production_briefs ADD COLUMN soft_holds jsonb CHECK (jsonb_typeof(soft_holds)='array' AND jsonb_array_length(soft_holds)<=10);
ALTER TABLE app.production_briefs DROP CONSTRAINT production_briefs_check;
ALTER TABLE app.production_briefs ADD CONSTRAINT production_briefs_schedule_check CHECK ((shoot_starts_at IS NULL AND shoot_ends_at IS NULL) OR (shoot_starts_at IS NOT NULL AND shoot_ends_at>shoot_starts_at AND status IN ('submitted','approved')));
ALTER TABLE app.production_assignments ADD COLUMN crew_request_id uuid;
ALTER TABLE app.production_attachments ADD COLUMN category text NOT NULL DEFAULT 'reference' CHECK (category IN ('brand_guidelines','creative_assets','creative_brief','shot_list','release','location_agreement','consent','storyboard','reference'));
ALTER TABLE app.production_brief_events DROP CONSTRAINT production_brief_events_kind_check;
ALTER TABLE app.production_brief_events ADD CONSTRAINT production_brief_events_kind_check CHECK (kind IN ('created','saved','submitted','approved','changes_requested','denied','scheduled','withdrawn','reopened','commented','crew_assigned','attachment_added','attachment_removed','dates_proposed'));
ALTER TABLE app.user_alerts DROP CONSTRAINT user_alerts_kind_check;
ALTER TABLE app.user_alerts ADD CONSTRAINT user_alerts_kind_check CHECK (kind IN ('overdue_equipment','report_update','reservation_conflict','production_assignment','production_readiness'));
