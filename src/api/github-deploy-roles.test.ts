// @vitest-environment node
import {expect,it} from 'vitest'
import {githubDeployRoles} from '../../infra/ci/github-deploy-roles'

type Role={Properties:{AssumeRolePolicyDocument:{Statement:{Condition:{StringEquals:Record<string,string>}}[]};Policies:{PolicyDocument:{Statement:{Action:string[];Resource:string[]}[]}}[]}}

it('lets only the matching GitHub environment assume each publish-only role',()=>{
  const resources=githubDeployRoles(false).Resources as Record<string,Role>
  const sub=(role:Role)=>role.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub']
  expect(sub(resources.DevWebRole)).toBe('repo:The-Agency-at-UF/studiostack:environment:development')
  expect(sub(resources.ProdWebRole)).toBe('repo:The-Agency-at-UF/studiostack:environment:production')
  for(const role of [resources.DevWebRole,resources.ProdWebRole])for(const s of role.Properties.Policies[0].PolicyDocument.Statement){
    expect(s.Action.every(a=>a.startsWith('amplify:')&&!a.includes('*'))).toBe(true)
    expect(s.Resource.every(r=>r.startsWith('arn:aws:amplify:us-east-2:423563856930:apps/'))).toBe(true)
  }
  expect(JSON.stringify(resources.DevWebRole)).not.toContain('dxs0q7vrz4oko')
})

it('creates the OIDC provider only when the account lacks one',()=>{
  expect(githubDeployRoles(true).Resources).toHaveProperty('Provider')
  expect(githubDeployRoles(false).Resources).not.toHaveProperty('Provider')
})
