import {it,expect} from 'vitest'
import {databaseApiInfrastructure} from '../../infra/database/api-resources'
it('keeps deployed route IDs stable when adding Agency production endpoints',()=>{
 const resources=databaseApiInfrastructure({STUDIOSTACK_ENV:'dev',DATABASE_API_ID:'vugf6fpl4k',COGNITO_USER_POOL_ID:'us-east-2_test',COGNITO_APP_CLIENT_ID:'client'},true).Resources as Record<string,{Properties:{RouteKey:string}}>
 expect(resources.Route16.Properties.RouteKey).toBe('GET /organizations/{organizationId}/production/access')
 expect(resources.Route54.Properties.RouteKey).toBe('GET /organizations/{organizationId}/alerts/preferences')
 expect(resources.Route56.Properties.RouteKey).toBe('POST /organizations/{organizationId}/alerts/{alertId}/read')
 expect(resources.Route61.Properties.RouteKey).toBe('POST /organizations/{organizationId}/production/briefs/{briefId}/crew')
})
