// @vitest-environment node
import { it, expect } from 'vitest'
import { devAuthInfrastructure } from '../../infra/database/dev-auth'

it('keeps development login invite/admin-only and uses scoped public OAuth code clients', () => {
  const template = devAuthInfrastructure()
  expect(template.Resources.Pool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly).toBe(true)
  expect(template.Resources.Pool.Properties.UserPoolTier).toBe('LITE')
  const client = template.Resources.Client.Properties
  expect(client.GenerateSecret).toBe(false)
  expect(client.AllowedOAuthFlows).toEqual(['code'])
  expect(client.AllowedOAuthScopes).toContain('studiostack-api/access')
  expect(client.AccessTokenValidity).toBe(15)
  expect(client.CallbackURLs.every(url => url.startsWith('http://localhost:'))).toBe(true)
  expect(JSON.stringify(template)).not.toContain('studiostack-prod')
})
