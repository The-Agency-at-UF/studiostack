import type { createDatabase } from '../database/client'
import type { DatabaseConfig } from '../database/config'
import { object } from '../database/api-validation'
import { lockOrganizationAdministration } from '../accounts/ownership'
/** IAM-only owner onboarding; production requires its explicit maintenance flag. */
export async function bootstrapProductionAdmin(database: ReturnType<typeof createDatabase>, config: DatabaseConfig, input: unknown) {
  const v = object(input,['action','subject','email'])
  if (!(config.environment==='dev'||config.environment==='prod'&&process.env.ALLOW_PRODUCTION_OWNER_BOOTSTRAP==='yes') || v.email !== 'rmckenzie1@ufl.edu' || typeof v.subject !== 'string' || !/^[a-f0-9-]{36}$/.test(v.subject) || !process.env.COGNITO_USER_POOL_ID) throw new Error('Approved organization owner required')
  const issuer = `https://cognito-idp.us-east-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
  return database.transaction(async client=>{
    const user = (await client.query(`INSERT INTO app.users (cognito_issuer,cognito_subject,email,display_name) VALUES ($1,$2,$3,$4) ON CONFLICT (cognito_issuer,cognito_subject) DO UPDATE SET email=EXCLUDED.email WHERE app.users.deletion_requested_at IS NULL RETURNING id`,[issuer,v.subject,v.email,'Roger McKenzie'])).rows[0]
    if(!user)throw new Error('Approved owner account has been retired')
    const created = await client.query(`INSERT INTO app.organizations (slug,name) VALUES ('agency-uf','The Agency at UF') ON CONFLICT (slug) DO NOTHING RETURNING id,name,slug`)
    const org = created.rows[0] ?? (await client.query("SELECT id,name,slug FROM app.organizations WHERE slug='agency-uf'")).rows[0]
    await lockOrganizationAdministration(client,org.id)
    await client.query("SELECT set_config('app.organization_id',$1,true)",[org.id])
    if(created.rows.length)await client.query(`INSERT INTO app.organization_memberships (organization_id,user_id,role,status) VALUES ($1,$2,'owner','active')`,[org.id,user.id])
    const membership=(await client.query('SELECT role,status FROM app.organization_memberships WHERE organization_id=$1 AND user_id=$2',[org.id,user.id])).rows[0]
    if(!created.rows.length&&(membership?.role!=='owner'||membership.status!=='active'))throw new Error('Existing workspace requires a verified active owner subject')
    // New @ufl.edu accounts join the Agency from onboarding through this domain.
    await client.query(`INSERT INTO app.organization_domains (domain,organization_id,auto_join,created_by) VALUES ('ufl.edu',$1,true,$2) ON CONFLICT (domain) DO NOTHING`,[org.id,user.id])
    const counts=(await client.query('SELECT (SELECT count(*)::int FROM app.organization_memberships WHERE organization_id=$1) AS members,(SELECT count(*)::int FROM app.inventory WHERE organization_id=$1) AS equipment,(SELECT count(*)::int FROM app.production_briefs WHERE organization_id=$1 AND deleted_at IS NULL) AS briefs',[org.id])).rows[0]
    return {ok:true,organizationId:org.id,userId:user.id,membership,workspace:{name:org.name,slug:org.slug,...counts}}
  },'maintenance')
}
