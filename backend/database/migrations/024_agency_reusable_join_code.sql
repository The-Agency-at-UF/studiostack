-- Provision the Agency's initial reusable code without embedding a credential in
-- source control. UUID bytes selected below exclude the fixed version byte;
-- their low five bits provide ten uniformly random Crockford base32 characters.
WITH agency AS (
  SELECT o.id, m.user_id
  FROM app.organizations o
  JOIN LATERAL (
    SELECT user_id FROM app.organization_memberships
    WHERE organization_id=o.id AND role='owner' AND status='active'
    ORDER BY created_at,user_id LIMIT 1
  ) m ON true
  WHERE o.slug='agency-uf'
    AND NOT EXISTS (
      SELECT 1 FROM app.organization_join_codes c
      WHERE c.organization_id=o.id AND c.display_code IS NOT NULL AND c.revoked_at IS NULL
    )
), entropy AS MATERIALIZED (
  SELECT id,user_id,decode(replace(gen_random_uuid()::text,'-',''),'hex') AS bytes FROM agency
), generated AS (
  SELECT id,user_id,(
    SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',(get_byte(bytes,i)&31)+1,1),'' ORDER BY i)
    FROM unnest(ARRAY[0,1,2,3,4,5,7,8,9,10]) AS i
  ) AS plain FROM entropy
)
INSERT INTO app.organization_join_codes (organization_id,code_hash,label,created_by,display_code)
SELECT id,encode(sha256(convert_to('studiostack-join:'||plain,'UTF8')),'hex'),
  'The Agency at UF join code',user_id,substr(plain,1,5)||'-'||substr(plain,6,5)
FROM generated;
