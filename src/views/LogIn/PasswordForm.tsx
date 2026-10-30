'use client'
import {useEffect,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {HiOutlineArrowRight,HiOutlineEye,HiOutlineEyeSlash,HiOutlineLockClosed} from 'react-icons/hi2'
import {passwordSignIn,invitationPassword,createAccount,confirmAccount,resendAccountCode,requestPasswordReset,confirmPasswordReset,passwordError,passwordRules,type PasswordStep} from '../../auth/password'
import type {SignedInUser} from '../../auth/cognito'
export type PasswordFormStep='sign-in'|'sign-up'|'confirm-sign-up'|'forgot'|'reset'|'new-password'
const titles:Record<PasswordFormStep,string>={'sign-in':'Sign in','sign-up':'Create your account','confirm-sign-up':'Verify your email',forgot:'Reset your password',reset:'Check your email','new-password':'Choose your password'}
const actions:Record<PasswordFormStep,string>={'sign-in':'Sign in','sign-up':'Create account','confirm-sign-up':'Verify email',forgot:'Send reset code',reset:'Update password','new-password':'Finish account setup'}
export default function PasswordForm({onAuthenticated,onBusyChange,onStepChange,configured=true}:{onAuthenticated:(user:SignedInUser)=>Promise<void>;onBusyChange?:(busy:boolean)=>void;onStepChange?:(step:PasswordFormStep)=>void;configured?:boolean}) {
  const [step,setStep]=useState<PasswordFormStep>('sign-in'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[code,setCode]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const emailInput=useRef<HTMLInputElement>(null),passwordInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null)
  const verifying=step==='confirm-sign-up',choosingPassword=step==='reset'||step==='new-password'||step==='sign-up'
  useEffect(()=>{(step==='reset'||step==='confirm-sign-up'?codeInput:step==='new-password'?passwordInput:emailInput).current?.focus()},[step])
  function changeStep(next:PasswordFormStep){setStep(next);onStepChange?.(next);setError('');setNotice('');setPassword('');setConfirmation('');setCode('');setVisible(false)}
  async function finish(result:PasswordStep){
    setPassword('');setConfirmation('')
    if(result.step==='new-password')changeStep('new-password')
    else if(result.step==='reset-password')changeStep('forgot')
    else if(result.step==='confirm-sign-up'){changeStep('confirm-sign-up');setNotice('Enter your email verification code, or request a new one below.')}
    else await onAuthenticated(result.user)
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy)return;setError('');setNotice('')
    if(choosingPassword&&(!passwordRules(password)||password!==confirmation)){setError(password!==confirmation?'The passwords do not match.':'Use at least 8 characters, one uppercase letter and one special character.');return}
    setBusy(true);onBusyChange?.(true)
    try{
      if(step==='sign-in')await finish(await passwordSignIn(email,password))
      else if(step==='sign-up'){
        const complete=await createAccount(email,password)
        changeStep(complete?'sign-in':'confirm-sign-up')
        setNotice(complete?'Your account is ready. Sign in with your password.':'Check your email for a verification code. Use the newest message.')
      }else if(verifying){
        await confirmAccount(email,code);changeStep('sign-in');setNotice('Email verified. Sign in to connect with your organization.')
      }else if(step==='new-password')await finish(await invitationPassword(password))
      else if(step==='forgot'){await requestPasswordReset(email);changeStep('reset');setNotice('Check your email for a reset code. Use the newest message.')}
      else{await confirmPasswordReset(email,code,password);changeStep('sign-in');setNotice('Password updated. Sign in with your new password.')}
    }catch(e){setError(passwordError(e))}finally{setBusy(false);onBusyChange?.(false)}
  }
  async function resend(){
    if(busy)return;setError('');setNotice('');setBusy(true);onBusyChange?.(true)
    try{await resendAccountCode(email);setCode('');setNotice('A new verification code was sent to your email.');codeInput.current?.focus()}
    catch(e){setError(passwordError(e))}finally{setBusy(false);onBusyChange?.(false)}
  }
  const passwordLabel=choosingPassword&&step!=='sign-up'?'New password':'Password'
  return <form className="login-password-form" onSubmit={submit} aria-label={step==='sign-up'||verifying?'StudioStack account sign-up':'StudioStack account sign-in'}><fieldset disabled={busy||!configured}>
    {!onStepChange&&step!=='sign-in'&&<div className="login-step-heading"><h2>{titles[step]}</h2></div>}
    <label htmlFor="studio-email">Email<input id="studio-email" ref={emailInput} name="email" type="email" autoComplete="username" value={email} maxLength={254} readOnly={step==='new-password'||step==='reset'||verifying} onChange={e=>setEmail(e.target.value)} required/></label>
    {(step==='reset'||verifying)&&<label htmlFor="studio-code">{verifying?'Email verification code':'Email reset code'}<input id="studio-code" ref={codeInput} name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={12} value={code} onChange={e=>setCode(e.target.value)} required/></label>}
    {step!=='forgot'&&!verifying&&<><div className="login-password-field"><label htmlFor="studio-password">{passwordLabel}</label><span className="login-password-input"><input id="studio-password" ref={passwordInput} name="password" type={visible?'text':'password'} autoComplete={choosingPassword?'new-password':'current-password'} aria-describedby={choosingPassword?'studio-password-rules':undefined} value={password} maxLength={256} minLength={choosingPassword?8:undefined} onChange={e=>setPassword(e.target.value)} required/><button className="login-password-toggle" type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<HiOutlineEyeSlash/>:<HiOutlineEye/>}</button></span></div>
      {choosingPassword&&<><label htmlFor="studio-confirm">{step==='sign-up'?'Confirm password':'Confirm new password'}<input id="studio-confirm" name="confirmation" type={visible?'text':'password'} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/></label><p id="studio-password-rules" className="login-field-hint">At least 8 characters, one uppercase letter and one special character.</p></>}
    </>}
    {step==='sign-in'&&<button type="button" className="login-forgot-action" onClick={()=>changeStep('forgot')}>Forgot password?</button>}
    {step==='sign-up'&&<p className="login-field-hint">Create your account, verify your email, then accept your team’s invitation. Your organization manages workspace access.</p>}
    {error&&<p className="login-error" role="alert">{error}</p>}{notice&&<p className="login-auth-notice" role="status">{notice}</p>}
    <button className="login-primary" disabled={busy||!configured}>{busy?<><span className="login-spinner" aria-hidden="true"/>Please wait…</>:<>{actions[step]}<HiOutlineArrowRight aria-hidden="true"/></>}</button>
    {step==='sign-in'&&<p className="login-account-switch">New to StudioStack? <button type="button" className="login-text-action" onClick={()=>changeStep('sign-up')}>Sign up</button></p>}
    {step!=='sign-in'&&<button type="button" className="login-text-action" onClick={()=>changeStep('sign-in')}>Back to sign in</button>}
    {step==='reset'&&<button type="button" className="login-text-action" onClick={()=>changeStep('forgot')}>Request a new code</button>}
    {verifying&&<><button type="button" className="login-text-action" onClick={()=>void resend()}>Resend verification code</button><button type="button" className="login-text-action" onClick={()=>changeStep('sign-up')}>Use another email</button></>}
    <p className="login-password-note"><HiOutlineLockClosed aria-hidden="true"/>Your organization controls access to its workspace.</p>
  </fieldset></form>
}
