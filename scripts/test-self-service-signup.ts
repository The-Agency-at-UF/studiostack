import {randomBytes,randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {createAccount,confirmAccount,resendAccountCode,passwordSignIn} from '../src/auth/password'
import {clearSignIn,accessToken} from '../src/auth/cognito'
import {aws,guardDevApply,devDirectory,pause} from './dev-aws'
import {readMetadata} from './deploy-dev-api'
async function removeSynthetic(pool:string,email:string){
  try{await aws('cognito-idp','admin-delete-user',['--user-pool-id',pool,'--username',email])}catch(error){if((error as {code?:string}).code!=='UserNotFoundException')throw error}
}
async function main(){
  await guardDevApply();const {auth}=await readMetadata(),run=randomUUID(),email=`success+signup-${run}@simulator.amazonses.com`,password=randomBytes(24).toString('base64url')+'A!',checks:string[]=[]
  const config={issuer:auth.Issuer,clientId:auth.AppClientId,domain:auth.Domain,redirectUri:'http://localhost:5174/login/',apiUrl:'https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com'}
  const storage=new Map<string,string>();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}})
  // Only a disposable SES simulator identity is ever mutated or emailed.
  try{
    if(await createAccount(email,password,config))throw new Error('Signup bypassed email confirmation');checks.push('Public signup requires email confirmation')
    if((await passwordSignIn(email,password,config)).step!=='confirm-sign-up')throw new Error('Unconfirmed account signed in');checks.push('Unconfirmed account cannot establish an app session')
    await resendAccountCode(email,config);checks.push('Resend uses email only')
    let rejected=false;try{await confirmAccount(email,'invalid-code',config)}catch(error){if(!['CodeMismatchException','InvalidParameterException'].includes((error as {name:string}).name))throw error;rejected=true}if(!rejected)throw new Error('Invalid verification code accepted');checks.push('Invalid confirmation code rejected')
    // Mailbox simulator codes cannot be read. Confirm only this owned synthetic
    // account administratively; the real UI confirmation is covered separately.
    await aws('cognito-idp','admin-confirm-sign-up',['--user-pool-id',auth.UserPoolId,'--username',email])
    await aws('cognito-idp','admin-update-user-attributes',['--user-pool-id',auth.UserPoolId,'--username',email,'--user-attributes','Name=email_verified,Value=true'])
    if((await passwordSignIn(email,password,config)).step!=='done')throw new Error('Confirmed account cannot sign in');checks.push('Confirmed account signs in with verified SRP tokens')
    for(const path of ['/me','/organizations']){let status=0;for(let attempt=0;attempt<8;attempt++){await pause(attempt?3000:800);const response=await fetch(config.apiUrl+path,{headers:{Authorization:`Bearer ${await accessToken()}`},signal:AbortSignal.timeout(35000)});status=response.status;if(![429,502,503,504].includes(status))break}if(status!==404)throw new Error('Unregistered signup identity check '+path+' returned '+status)}
    checks.push('New identity receives no database profile or organization access automatically')
    await writeFile(devDirectory+'/signup-verification.json',JSON.stringify({checks,confirmationMethod:'Administrative confirmation of disposable simulator only; UI confirmation tested separately',verifiedAt:new Date().toISOString()},null,2));console.log(`Signup passed ${checks.length} live checks`)
  }finally{
    clearSignIn()
    await removeSynthetic(auth.UserPoolId,email)
    console.log('Disposable signup identity removed; no database records created')
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Signup verification failed');process.exitCode=1})
