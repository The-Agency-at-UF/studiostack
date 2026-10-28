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
  expect(client.CallbackURLs).toEqual(['http://localhost:5174/login/','http://localhost:5417/callback','https://dev.dvmmztb0u3m9g.amplifyapp.com/login/'])
  expect(template.Resources.Pool.Properties.AdminCreateUserConfig.InviteMessageTemplate.EmailMessage).toContain('{####}')
  expect(JSON.stringify(template)).not.toContain('studiostack-prod')
})
