// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { infrastructure, executionPolicy, account, region, environments } from '../../infra/database/resources'

describe('environment-scoped private infrastructure', () => {
  const masters = { dev: 'dev-master-marker', prod: 'prod-master-marker' }
  it('removes all temporary master-secret access from the final endpoint policy', () => {
    const initial = infrastructure(masters, true)
    const final = infrastructure(masters, false)
    expect(JSON.stringify(initial.Resources.SecretsEndpoint)).toContain('dev-master-marker')
    expect(JSON.stringify(final.Resources.SecretsEndpoint)).not.toContain('master-marker')
    expect(JSON.stringify(final.Resources.SecretsEndpoint)).not.toContain('-setup-role')
    expect(JSON.stringify(final.Resources.SecretsEndpoint)).toContain('PrivateDnsEnabled')
  })
  it('keeps master references out of runtime roles and generates credentials in AWS', () => {
    const template = infrastructure(masters, true)
    for (const env of environments) {
      expect(JSON.stringify(template.Resources[`${env.logical}Role`])).not.toContain('master-marker')
      expect(JSON.stringify(template.Resources[`${env.logical}Role`])).toContain(`${env.logical}Secret`)
      expect(JSON.stringify(template.Resources[`${env.logical}Secret`])).toContain('GenerateSecretString')
    }
  })
  it('limits endpoint inbound HTTPS to the two existing backend groups', () => {
    const json = JSON.stringify(infrastructure(masters, false).Resources.EndpointGroup)
    expect(json).toContain('"FromPort":443')
    expect(json).toContain(environments[0].group)
    expect(json).toContain(environments[1].group)
    expect(json).not.toContain('0.0.0.0/0')
  })
  it('requires private-VPC secret retrieval and denies code-driven ENI writes', () => {
    const policy = executionPolicy('example', ['application-secret'])
    expect(policy.Statement).toContainEqual(expect.objectContaining({ Action: ['secretsmanager:GetSecretValue'], Resource: ['application-secret'], Condition: { StringEquals: { 'aws:SourceVpc': 'vpc-0c566c49de9c91bda' } } }))
    expect(policy.Statement).toContainEqual(expect.objectContaining({ Effect: 'Deny', Condition: { ArnEquals: { 'lambda:SourceFunctionArn': `arn:aws:lambda:${region}:${account}:function:example` } } }))
  })
  it('isolates both photo prefixes while enabling only the selected maintenance environment', () => {
    const old = infrastructure(masters, false), dev = infrastructure(masters, ['dev'], { prefixListId: 'pl-example' })
    for (const [name, resource] of Object.entries(old.Resources)) if (name.startsWith('Prod')&&name!=='ProdRole') expect(dev.Resources[name]).toEqual(resource)
    const endpoint = JSON.stringify(dev.Resources.SecretsEndpoint)
    expect(endpoint).toContain('dev-master-marker')
    expect(endpoint).not.toContain('prod-master-marker')
    expect(endpoint).not.toContain('studiostack-prod-database-setup-role')
    expect(JSON.stringify(dev.Resources.DevRole)).toContain('studio-stack-photos-dev/staging/*')
    expect(JSON.stringify(dev.Resources.DevRole)).not.toContain('studio-stack-photos-prod')
    expect(JSON.stringify(dev.Resources.ProdRole)).toContain('studio-stack-photos-prod/staging/*')
    expect(JSON.stringify(dev.Resources.ProdRole)).not.toContain('studio-stack-photos-dev')
    expect(JSON.stringify(dev.Resources.DevS3Endpoint)).toContain('ProdRole')
    expect(JSON.stringify(dev.Resources.DevS3Endpoint)).toContain('studio-stack-photos-prod/photos/*')
  })
})
