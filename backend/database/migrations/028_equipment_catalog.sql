ALTER TABLE app.inventory DROP CONSTRAINT inventory_category_check;
ALTER TABLE app.inventory ADD CONSTRAINT inventory_category_check CHECK (category IN ('Camera & Accessories','Lights','Production Design','Audio','Cables & Cords','Miscellaneous','Tripods / Stands','Props','SD Cards'));
-- Keep the stored retired value compatible with older clients; the product calls it Archive.
ALTER TABLE app.inventory ADD COLUMN color_tag text CHECK (color_tag IN ('red','orange','yellow','green','blue','purple','black','white'));
CREATE INDEX reservations_overdue_owner ON app.reservations(organization_id,user_id,ends_at) WHERE status='confirmed' AND fulfillment_status='checked_out';
