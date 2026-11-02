-- Review and ELT roles end with the membership. Remove people who are no
-- longer active members; the API keeps the lists in step from here on.
UPDATE app.production_settings s SET
  reviewer_ids = ARRAY(SELECT r.id FROM unnest(s.reviewer_ids) WITH ORDINALITY r(id, n) WHERE EXISTS (SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = s.organization_id AND m.user_id = r.id AND m.status = 'active') ORDER BY r.n),
  executive_ids = ARRAY(SELECT e.id FROM unnest(s.executive_ids) WITH ORDINALITY e(id, n) WHERE EXISTS (SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = s.organization_id AND m.user_id = e.id AND m.status = 'active') ORDER BY e.n),
  version = s.version + 1
WHERE EXISTS (
  SELECT 1 FROM unnest(s.reviewer_ids || s.executive_ids) p(id)
  WHERE NOT EXISTS (SELECT 1 FROM app.organization_memberships m WHERE m.organization_id = s.organization_id AND m.user_id = p.id AND m.status = 'active')
);
