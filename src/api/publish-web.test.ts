// @vitest-environment node
import {expect,it} from 'vitest'
import {webBuildEnv,webOrigin,webTargets} from '../../scripts/publish-web'

it('builds each environment against its own hosting, Cognito pool and API',()=>{
  expect(webOrigin('dev')).toBe('https://dev.dvmmztb0u3m9g.amplifyapp.com')
  expect(webOrigin('prod')).toBe('https://main.dxs0q7vrz4oko.amplifyapp.com')
  const dev=webBuildEnv('dev'),prod=webBuildEnv('prod')
  expect(dev.NEXT_PUBLIC_DATABASE_API_URL).toContain('vugf6fpl4k')
  expect(prod.NEXT_PUBLIC_DATABASE_API_URL).toContain('ixzikwz8n5')
  expect(prod.NEXT_PUBLIC_COGNITO_REDIRECT_URI).toBe('https://main.dxs0q7vrz4oko.amplifyapp.com/login/')
  expect(dev.NEXT_PUBLIC_COGNITO_USER_POOL_ID).not.toBe(prod.NEXT_PUBLIC_COGNITO_USER_POOL_ID)
  expect(prod.NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS).toBe('')
})

it('keeps only public identifiers in the committed targets',()=>{
  for(const target of Object.values(webTargets))for(const value of Object.values(target))
    expect(String(value)).not.toMatch(/secret|password|arn:aws:secretsmanager/i)
})
