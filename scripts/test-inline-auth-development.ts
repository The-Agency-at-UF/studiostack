import {randomBytes,randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {passwordSignIn,invitationPassword,requestPasswordReset} from '../src/auth/password'
import {clearSignIn,accessToken} from '../src/auth/cognito'
import {aws,guardDevApply,devDirectory,pause} from './dev-aws'
import {readMetadata} from './deploy-dev-api'
async function main(){await guardDevApply();const metadata=await readMetadata(),run=randomUUID(),created:string[]=[],values=new Map<string,string>()
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}})
  const config={issuer:metadata.auth.Issuer,clientId:metadata.auth.AppClientId,domain:metadata.auth.Domain,redirectUri:'http://localhost:5174/login/',apiUrl:'https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com'}
  const password=`${randomBytes(24).toString('base64url')}aA1!`,newPassword=Array.from(randomBytes(7),b=>String.fromCharCode(65+b%26)).join('')+'!'
  const checks:string[]=[]
  try{
    for(let i=0;i<2;i++){const email=`success+inline-${run}-${i}@simulator.amazonses.com`;await aws('cognito-idp','admin-create-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',email,'--temporary-password',password,'--message-action','SUPPRESS','--user-attributes',`Name=email,Value=${email}`,'Name=email_verified,Value=true']);created.push(email)}
    await aws('cognito-idp','admin-set-user-password',['--user-pool-id',metadata.auth.UserPoolId,'--username',created[0],'--password',password,'--permanent'])
    let failed=false;try{await passwordSignIn(created[0],`${password}wrong`,config)}catch(error){if((error as {name?:string}).name!=='NotAuthorizedException')throw error;failed=true}if(!failed)throw new Error('Invalid password was accepted');checks.push('Invalid password rejected')
    const first=await passwordSignIn(created[0],password,config);if(first.step!=='done')throw new Error('SRP did not finish');checks.push('SRP tokens verified against real Cognito signing keys')
    await pause(750);const response=await fetch(`${config.apiUrl}/me`,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(35000)});if(response.status!==404)throw new Error(`SDK access token API check failed (${response.status})`);checks.push('SDK access token accepted; unregistered profile remains unavailable')
    await pause(750);const inbox=await fetch(`${config.apiUrl}/account/invitations`,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(35000)});if(inbox.status!==404)throw new Error(`SDK invitation bridge check failed (${inbox.status})`);checks.push('Verified invitation bridge accepts SDK access tokens')
    clearSignIn();const invitation=await passwordSignIn(created[1],password,config);if(invitation.step!=='new-password')throw new Error('Invitation did not require a new password');checks.push('Invitation requires new password')
    const completed=await invitationPassword(newPassword,config);if(completed.step!=='done')throw new Error('Invitation password setup did not complete');checks.push('Approved eight-character password completes invitation setup')
    clearSignIn();if((await passwordSignIn(created[1],newPassword,config)).step!=='done')throw new Error('New password could not sign in');checks.push('New password signs in through SRP')
    clearSignIn();const reset=await requestPasswordReset(created[0],config);if(reset.nextStep.resetPasswordStep!=='CONFIRM_RESET_PASSWORD_WITH_CODE'||reset.nextStep.codeDeliveryDetails.deliveryMedium!=='EMAIL')throw new Error('Reset did not use email');checks.push('Password reset uses email to SES simulator only')
    await writeFile(`${devDirectory}/inline-auth-verification.json`,JSON.stringify({checks,verifiedAt:new Date().toISOString()},null,2));console.log(`Inline authentication passed ${checks.length} live Cognito/API checks`)
  }finally{clearSignIn();for(const username of created)await aws('cognito-idp','admin-delete-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',username]);console.log('Synthetic inline-auth accounts removed; no database profiles created')}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Inline authentication verification failed');process.exitCode=1})
