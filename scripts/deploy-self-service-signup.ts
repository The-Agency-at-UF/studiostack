import {aws,applyStack,guardDevApply} from './dev-aws'
import {readMetadata} from './deploy-dev-api'
import {devAuthInfrastructure} from '../infra/database/dev-auth'

async function main(){
  await guardDevApply()
  const metadata=await readMetadata()
  const result=await applyStack('studiostack-dev-auth',devAuthInfrastructure())
  if(result.UserPoolId!==metadata.auth.UserPoolId||result.AppClientId!==metadata.auth.AppClientId)throw new Error('Authentication identity changed; do not publish')
  const {UserPool:pool}=await aws<{UserPool:{AdminCreateUserConfig?:{AllowAdminCreateUserOnly?:boolean};AutoVerifiedAttributes?:string[];AccountRecoverySetting?:{RecoveryMechanisms?:{Name:string}[]}}}>('cognito-idp','describe-user-pool',['--user-pool-id',metadata.auth.UserPoolId])
  if(pool.AdminCreateUserConfig?.AllowAdminCreateUserOnly!==false||!pool.AutoVerifiedAttributes?.includes('email')||pool.AccountRecoverySetting?.RecoveryMechanisms?.some(m=>m.Name!=='verified_email'))throw new Error('Email signup/recovery configuration differs')
  console.log('Development signup enabled with email verification; existing user pool and client preserved')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Signup configuration failed');process.exitCode=1})
