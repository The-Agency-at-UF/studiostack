// @vitest-environment node
import {describe,expect,it,vi} from 'vitest'
import type {APIGatewayProxyEventV2WithJWTAuthorizer} from 'aws-lambda'
import {deliverInvitations,handleDirectory} from '../../backend/accounts/worker'
import {accountInfrastructure} from '../../infra/production/accounts'
const id='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222'
const config={apiId:'vugf6fpl4k',issuer:'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test',clientId:'client'}
function event(body?:unknown){return {version:'2.0',routeKey:body?'POST /account/invitations/{invitationId}/accept':'GET /account/invitations',headers:{authorization:'Bearer synthetic-token'},pathParameters:{invitationId:id},body:body?JSON.stringify(body):undefined,isBase64Encoded:false,requestContext:{apiId:config.apiId,http:{method:body?'POST':'GET'},authorizer:{jwt:{claims:{iss:config.issuer,client_id:config.clientId,token_use:'access',sub:id,exp:String(Date.now()/1000+600),scope:'studiostack-api/access'}}}}} as unknown as APIGatewayProxyEventV2WithJWTAuthorizer}
const attributes=[{Name:'sub',Value:id},{Name:'email',Value:'verified@example.org'},{Name:'email_verified',Value:'true'}]
describe('verified invitation bridge and delivery',()=>{
  it('uses authoritative Cognito email and binds acceptance to the authenticated subject',async()=>{
    const store=vi.fn().mockResolvedValue({organizationId:org}),getUser=vi.fn().mockResolvedValue({UserAttributes:attributes})
    expect((await handleDirectory(event({organizationId:org}),config,{getUser,store})).statusCode).toBe(200)
    expect(store).toHaveBeenCalledExactlyOnceWith({action:'accept',invitationId:id,organizationId:org,identity:{issuer:config.issuer,subject:id,email:'verified@example.org'}})
  })
  it.each([{UserAttributes:attributes.filter(a=>a.Name!=='email_verified')},{UserAttributes:attributes.map(a=>a.Name==='sub'?{...a,Value:org}:a)}])('rejects unverified or mismatched identities',async({UserAttributes})=>{
    const store=vi.fn();expect((await handleDirectory(event(),config,{getUser:async()=>({UserAttributes}),store})).statusCode).toBe(403);expect(store).not.toHaveBeenCalled()
  })
  it('rejects supplied identity/email fields in HTTP requests',async()=>{
    const store=vi.fn();expect((await handleDirectory(event({organizationId:org,email:'attacker@example.org'}),config,{getUser:async()=>({UserAttributes:attributes}),store})).statusCode).toBe(400);expect(store).not.toHaveBeenCalled()
  })
  it.each([['TooManyRequestsException','retry'],['MessageRejected','failed'],['TimeoutError','uncertain']])('handles %s without blindly resending',async(name,outcome)=>{
    const job={id,organizationId:org,organizationName:'Studio',email:'a@example.org',displayName:'A',role:'member',attempts:1,leaseToken:id},store=vi.fn().mockResolvedValueOnce({jobs:[job]}).mockResolvedValue({updated:true}),send=vi.fn().mockRejectedValue(Object.assign(new Error('Synthetic'),{name}))
    await deliverInvitations({store,send});expect(send).toHaveBeenCalledTimes(1);expect(store).toHaveBeenLastCalledWith(expect.objectContaining({outcome,leaseToken:id}))
  })
  it('creates only JWT account routes and scoped directory/delivery permissions',()=>{
    const template=accountInfrastructure({environment:'dev',artifactBucket:'studio-stack-photos-dev',artifactKey:'deployments/accounts/test.zip',pool:'us-east-2_test',client:'client',apiId:config.apiId,authorizerId:'auth',sender:'owner@example.org',webUrl:'https://studio.example.org'})
    const serialized=JSON.stringify(template);expect(serialized).toContain('cognito-idp:AdminCreateUser');expect(serialized).not.toMatch(/AdminSetUserPassword|AdminAddUserToGroup|studiostack-prod|NAT|secretsmanager:GetSecretValue/)
    const routes=Object.values(template.Resources).filter((r)=> (r as {Type:string}).Type==='AWS::ApiGatewayV2::Route') as {Properties:{AuthorizationType:string}}[]
    expect(routes).toHaveLength(2);expect(routes.every(r=>r.Properties.AuthorizationType==='JWT')).toBe(true)
  })
})
