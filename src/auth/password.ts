import {Amplify} from '@aws-amplify/core'
import {signIn,confirmSignIn,resetPassword,confirmResetPassword,fetchAuthSession,type SignInOutput} from '@aws-amplify/auth'
import {cognitoUserPoolsTokenProvider} from '@aws-amplify/auth/cognito'
import {volatileAuthStorage} from './volatileStorage'
import {acceptPasswordTokens,authConfiguration,type AuthConfig,type SignedInUser} from './cognito'
let configured=''
function configure(config:AuthConfig){const key=`${config.issuer}:${config.clientId}`;if(configured===key)return;const auth={Cognito:{userPoolId:config.issuer.split('/').at(-1)!,userPoolClientId:config.clientId}};cognitoUserPoolsTokenProvider.setKeyValueStorage(volatileAuthStorage);cognitoUserPoolsTokenProvider.setAuthConfig(auth);Amplify.configure({Auth:auth},{Auth:{tokenProvider:cognitoUserPoolsTokenProvider}});configured=key}
export type PasswordStep={step:'new-password'}|{step:'reset-password'}|{step:'done';user:SignedInUser}
async function result(output:SignInOutput,config:AuthConfig):Promise<PasswordStep>{
  if(output.isSignedIn){const {tokens}=await fetchAuthSession();if(!tokens?.accessToken||!tokens.idToken)throw new Error('Invalid sign-in response');return {step:'done',user:await acceptPasswordTokens(tokens.accessToken.toString(),tokens.idToken.toString(),config)}}
  if(output.nextStep.signInStep==='CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED')return {step:'new-password'}
  if(output.nextStep.signInStep==='RESET_PASSWORD')return {step:'reset-password'}
  throw new Error('This account requires an additional sign-in step. Contact your administrator.')
}
export async function passwordSignIn(email:string,password:string,config=authConfiguration()){configure(config);return result(await signIn({username:email.trim().toLowerCase(),password,options:{authFlowType:'USER_SRP_AUTH'}}),config)}
export async function invitationPassword(password:string,config=authConfiguration()){configure(config);return result(await confirmSignIn({challengeResponse:password}),config)}
export async function requestPasswordReset(email:string,config=authConfiguration()){configure(config);const output=await resetPassword({username:email.trim().toLowerCase()});if(output.nextStep.resetPasswordStep==='CONFIRM_RESET_PASSWORD_WITH_CODE'&&output.nextStep.codeDeliveryDetails.deliveryMedium!=='EMAIL')throw new Error('Email recovery is unavailable. Check your email address or contact your administrator.');return output}
export async function confirmPasswordReset(email:string,code:string,newPassword:string,config=authConfiguration()){configure(config);await confirmResetPassword({username:email.trim().toLowerCase(),confirmationCode:code.trim(),newPassword})}
export const passwordRules=(value:string)=>value.length>=8&&/[A-Z]/.test(value)&&/[^A-Za-z0-9\s]/.test(value)
export function passwordError(error:unknown){const name=(error as {name?:string})?.name;if(['NotAuthorizedException','UserNotFoundException'].includes(name??''))return 'Email or password is incorrect.';if(['CodeMismatchException','ExpiredCodeException'].includes(name??''))return 'The code is invalid or expired. Request a new code.';if(name==='InvalidPasswordException')return 'Use at least 8 characters, one uppercase letter and one special character.';if(['LimitExceededException','TooManyRequestsException'].includes(name??''))return 'Too many attempts. Wait a few minutes and try again.';return 'Authentication is temporarily unavailable. Check your email and try again.'}
