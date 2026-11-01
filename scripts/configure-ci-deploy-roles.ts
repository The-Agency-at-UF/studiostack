import {aws,applyStack} from './dev-aws'
import {account} from '../infra/database/resources'
import {githubDeployRoles} from '../infra/ci/github-deploy-roles'

/** One-time setup: GitHub OIDC trust and publish-only roles. Run locally with --apply. */
async function main(){
  if(process.argv.slice(2).join(' ')!=='--apply')throw new Error('Explicit --apply required')
  if((await aws<{Account:string}>('sts','get-caller-identity')).Account!==account)throw new Error('Unexpected AWS account')
  const {OpenIDConnectProviderList}=await aws<{OpenIDConnectProviderList:{Arn:string}[]}>('iam','list-open-id-connect-providers')
  const exists=OpenIDConnectProviderList.some(p=>p.Arn.endsWith('/token.actions.githubusercontent.com'))
  const outputs=await applyStack('studiostack-ci-deploy-roles',githubDeployRoles(!exists))
  console.log(`GitHub deploy roles ready (${exists?'existing':'new'} OIDC provider):`,JSON.stringify(outputs))
}
main().catch(error=>{console.error(error instanceof Error?error.message:'CI role setup failed');process.exitCode=1})
