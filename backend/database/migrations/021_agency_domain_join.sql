-- Replaces open enrollment: a verified @ufl.edu email joins the Agency from
-- onboarding instead of every new account being added at registration. The
-- domain is registered by the Agency's earliest active owner.
INSERT INTO app.organization_domains (domain, organization_id, auto_join, created_by)
SELECT 'ufl.edu', o.id, true, m.user_id
FROM app.organizations o
JOIN LATERAL (
  SELECT user_id FROM app.organization_memberships
  WHERE organization_id = o.id AND role = 'owner' AND status = 'active'
  ORDER BY created_at, user_id LIMIT 1
) m ON true
WHERE o.slug = 'agency-uf'
ON CONFLICT (domain) DO NOTHING;
