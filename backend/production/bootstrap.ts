import type { createDatabase } from '../database/client'
import type { DatabaseConfig } from '../database/config'
import { object } from '../database/api-validation'
/** Explicit dev-only, IAM-invoked maintenance. Never exposed as an HTTP route. */
export async function bootstrapProductionAdmin(database: ReturnType<typeof createDatabase>, config: DatabaseConfig, input: unknown) {
  const v = object(input,['action','subject','email'])
  if (config.environment !== 'dev' || v.email !== 'rmckenzie1@ufl.edu' || typeof v.subject !== 'string' || !/^[a-f0-9-]{36}$/.test(v.subject) || !process.env.COGNITO_USER_POOL_ID) throw new Error('Approved development administrator required')
  const issuer = `https://cognito-idp.us-east-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
  return database.transaction(async client=>{
    const user = (await client.query(`INSERT INTO app.users (cognito_issuer,cognito_subject,email,display_name) VALUES ($1,$2,$3,$4) ON CONFLICT (cognito_issuer,cognito_subject) DO UPDATE SET email=EXCLUDED.email RETURNING id`,[issuer,v.subject,v.email,'Roger McKenzie'])).rows[0]
    const org = (await client.query(`INSERT INTO app.organizations (slug,name) VALUES ('agency-uf','The Agency at UF') ON CONFLICT (slug) DO UPDATE SET slug=EXCLUDED.slug RETURNING id`)).rows[0]
    await client.query(`INSERT INTO app.organization_memberships (organization_id,user_id,role,status) VALUES ($1,$2,'owner','active') ON CONFLICT (organization_id,user_id) DO UPDATE SET role='owner',status='active'`,[org.id,user.id])
    return {ok:true,organizationId:org.id,userId:user.id}
  },'maintenance')
}
