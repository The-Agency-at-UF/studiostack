// @vitest-environment node
import { describe,expect,it } from 'vitest'
import { productionNotificationInfrastructure } from '../../infra/production/notifications'
import { productionRoutes } from '../../backend/production/routes'
const input={environment:'dev' as const,artifactBucket:'studio-stack-photos-dev',artifactKey:'deployments/production/test/sender.zip',sender:'dev@example.org',identity:'dev@example.org',webUrl:'https://dev.example.org',userPoolId:'us-east-2_example',enabled:true}
describe('production notification deployment boundaries',()=>{
  it('uses an IAM-only private backend task and a metadata-only signal',()=>{
    const template=productionNotificationInfrastructure(input),json=JSON.stringify(template)
    expect(json).toContain('studiostack-dev-database');expect(json).not.toContain('studiostack-prod-database')
    expect(json).toContain('cognito-idp:AdminGetUser');expect(json).toContain('ses:FromAddress');expect(json).toContain('production-decision-queued')
    expect(productionRoutes.some(r=>/outbox|claim|ack/.test(r))).toBe(false)
    expect(json).not.toContain('NAT');expect(json).not.toContain('secretsmanager:GetSecretValue')
  })
  it('rejects cross-environment artifacts and unrelated senders',()=>{
    expect(()=>productionNotificationInfrastructure({...input,artifactBucket:'studio-stack-photos-prod'})).toThrow()
    expect(()=>productionNotificationInfrastructure({...input,identity:'other.example.org'})).toThrow()
    expect(()=>productionNotificationInfrastructure({...input,webUrl:'http://dev.example.org'})).toThrow()
  })
})
