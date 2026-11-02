import {randomBytes,randomUUID} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {guardProductionApply,productionMetadata,prodDirectory} from './prod-aws'
import {aws,pause} from './dev-aws'
import {passwordSignIn} from '../src/auth/password'
import {accessToken,clearSignIn} from '../src/auth/cognito'
/** Disposable Cognito identity only: never inserts synthetic production app records. */
async function main(){
 await guardProductionApply();const metadata=await productionMetadata(),username=`success+prod-auth-${randomUUID()}@simulator.amazonses.com`,password=randomBytes(32).toString('base64url')+'A!',values=new Map<string,string>(),checks:string[]=[];let created=false,passed=false
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}})
 try{
  await aws('cognito-idp','admin-create-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',username,'--message-action','SUPPRESS','--user-attributes',`Name=email,Value=${username}`,'Name=email_verified,Value=true']);created=true
  await aws('cognito-idp','admin-set-user-password',['--user-pool-id',metadata.auth.UserPoolId,'--username',username,'--password',password,'--permanent'])
  if((await passwordSignIn(username,password,{issuer:metadata.auth.Issuer,clientId:metadata.auth.AppClientId,domain:metadata.auth.Domain,redirectUri:metadata.app.origin+'/login/',apiUrl:'https://ixzikwz8n5.execute-api.us-east-2.amazonaws.com'})).step!=='done')throw new Error('Production SRP sign-in did not finish');checks.push('Native SRP tokens verified against production Cognito signing keys')
  for(const path of ['/me','/account/invitations']){await pause(800);const r=await fetch('https://ixzikwz8n5.execute-api.us-east-2.amazonaws.com'+path,{headers:{Authorization:'Bearer '+await accessToken()},signal:AbortSignal.timeout(35000)});if(r.status!==404)throw new Error('Production authenticated identity boundary failed ('+r.status+')');checks.push('Production SDK token accepted at '+path+'; unregistered app profile remains unavailable')}
  const {UserPool}=await aws<{UserPool:{AccountRecoverySetting:unknown;Policies:{PasswordPolicy:Record<string,unknown>}}}>('cognito-idp','describe-user-pool',['--user-pool-id',metadata.auth.UserPoolId]);if(JSON.stringify(UserPool.AccountRecoverySetting).includes('phone')||UserPool.Policies.PasswordPolicy.MinimumLength!==8||UserPool.Policies.PasswordPolicy.RequireUppercase!==true||UserPool.Policies.PasswordPolicy.RequireSymbols!==true)throw new Error('Production authentication policy differs');checks.push('Live production recovery is email only and password policy matches approval');passed=true
 }finally{clearSignIn();if(created)await aws('cognito-idp','admin-delete-user',['--user-pool-id',metadata.auth.UserPoolId,'--username',username]);if(passed)await writeFile(prodDirectory+'/authentication-verification.json',JSON.stringify({checks,verifiedAt:new Date().toISOString(),cleanupPending:false},null,2));console.log('Disposable production authentication account removed; no synthetic app records or emails created')}
 console.log('Production authentication passed '+checks.length+' live checks')
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production authentication verification failed');process.exitCode=1})
