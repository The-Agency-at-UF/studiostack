import {CognitoIdentityProviderClient,GetUserCommand,GetUserAttributeVerificationCodeCommand,VerifyUserAttributeCommand} from '@aws-sdk/client-cognito-identity-provider'
type Token=()=>Promise<string>
let client:CognitoIdentityProviderClient|undefined
const cognito=()=>client??=new CognitoIdentityProviderClient({region:'us-east-2',maxAttempts:1})
/** The signed-in account's email and whether Cognito has verified it. */
export async function emailStatus(getAccessToken:Token){const user=await cognito().send(new GetUserCommand({AccessToken:await getAccessToken()}));const attributes=Object.fromEntries((user.UserAttributes??[]).map(a=>[a.Name,a.Value]));return {email:attributes.email??'',verified:attributes.email_verified==='true'}}
export async function sendEmailCode(getAccessToken:Token){await cognito().send(new GetUserAttributeVerificationCodeCommand({AccessToken:await getAccessToken(),AttributeName:'email'}))}
export async function confirmEmailCode(getAccessToken:Token,code:string){await cognito().send(new VerifyUserAttributeCommand({AccessToken:await getAccessToken(),AttributeName:'email',Code:code.trim()}))}
/** Copy for the Cognito failures a person can act on; `sending` covers asking for a code rather than confirming one. */
export function emailCodeError(error:unknown,sending=false){const name=(error as {name?:string})?.name
  if(name==='CodeMismatchException')return 'That code doesn’t match. Check the email and try again.'
  if(name==='ExpiredCodeException')return 'That code has expired. Send another code.'
  if(name==='LimitExceededException'||name==='TooManyRequestsException')return 'Too many attempts. Wait a few minutes and try again.'
  return sending?'A code couldn’t be sent. Try again in a moment.':'The code is invalid or expired. Request a new code and try again.'}
