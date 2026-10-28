'use client'
import {useEffect,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {HiOutlineArrowRight,HiOutlineEye,HiOutlineEyeSlash,HiOutlineLockClosed} from 'react-icons/hi2'
import {passwordSignIn,invitationPassword,requestPasswordReset,confirmPasswordReset,passwordError,passwordRules,type PasswordStep} from '../../auth/password'
import type {SignedInUser} from '../../auth/cognito'
export type PasswordFormStep='sign-in'|'forgot'|'reset'|'new-password'
export default function PasswordForm({onAuthenticated,onBusyChange,onStepChange,configured=true}:{onAuthenticated:(user:SignedInUser)=>Promise<void>;onBusyChange?:(busy:boolean)=>void;onStepChange?:(step:PasswordFormStep)=>void;configured?:boolean}) {
  const [step,setStep]=useState<PasswordFormStep>('sign-in'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[code,setCode]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const emailInput=useRef<HTMLInputElement>(null),passwordInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null)
  useEffect(()=>{(step==='reset'?codeInput:step==='new-password'?passwordInput:emailInput).current?.focus()},[step])
  const choosingPassword=step==='reset'||step==='new-password'
  function changeStep(next:PasswordFormStep){setStep(next);onStepChange?.(next);setError('');setNotice('');setPassword('');setConfirmation('');setCode('');setVisible(false)}
  async function finish(result:PasswordStep){setPassword('');setConfirmation('');if(result.step==='new-password')changeStep('new-password');else if(result.step==='reset-password')changeStep('forgot');else await onAuthenticated(result.user)}
  async function submit(event:FormEvent){event.preventDefault();if(busy)return;setError('');setNotice('');if(choosingPassword&&(!passwordRules(password)||password!==confirmation)){setError(password!==confirmation?'The passwords do not match.':'Use at least 8 characters, one uppercase letter and one special character.');return}setBusy(true);onBusyChange?.(true)
    try{if(step==='sign-in')await finish(await passwordSignIn(email,password));else if(step==='new-password')await finish(await invitationPassword(password));else if(step==='forgot'){await requestPasswordReset(email);changeStep('reset');setNotice('Check your email for a reset code. Use the newest message.')}else{await confirmPasswordReset(email,code,password);changeStep('sign-in');setNotice('Password updated. Sign in with your new password.')}}catch(e){setError(passwordError(e))}finally{setBusy(false);onBusyChange?.(false)}
  }
  return <form className="login-password-form" onSubmit={submit} aria-label="StudioStack account sign-in"><fieldset disabled={busy||!configured}>
    {!onStepChange&&step!=='sign-in'&&<div className="login-step-heading"><h2>{step==='new-password'?'Choose your password':step==='forgot'?'Reset your password':'Check your email'}</h2><p>{step==='new-password'?'Finish setting up your invited account.':step==='forgot'?'We’ll send a reset code to your verified email.':'Enter the email code and choose a new password.'}</p></div>}
    <label htmlFor="studio-email">Email<input id="studio-email" ref={emailInput} name="email" type="email" autoComplete="username" value={email} maxLength={254} readOnly={step==='new-password'||step==='reset'} onChange={e=>setEmail(e.target.value)} required/></label>
    {step==='reset'&&<label htmlFor="studio-code">Email reset code<input id="studio-code" ref={codeInput} name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={12} value={code} onChange={e=>setCode(e.target.value)} required/></label>}
    {step!=='forgot'&&<><div className="login-password-field"><label htmlFor="studio-password">{choosingPassword?'New password':'Password'}</label><span className="login-password-input"><input id="studio-password" ref={passwordInput} name="password" type={visible?'text':'password'} autoComplete={choosingPassword?'new-password':'current-password'} value={password} maxLength={256} minLength={choosingPassword?8:undefined} onChange={e=>setPassword(e.target.value)} required/><button className="login-password-toggle" type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<HiOutlineEyeSlash/>:<HiOutlineEye/>}</button></span></div>
      {choosingPassword&&<><label htmlFor="studio-confirm">Confirm new password<input id="studio-confirm" name="confirmation" type={visible?'text':'password'} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/></label><p id="studio-password-rules" className="login-field-hint">At least 8 characters, one uppercase letter and one special character.</p></>}
    </>}
    {step==='sign-in'&&<button type="button" className="login-forgot-action" onClick={()=>changeStep('forgot')}>Forgot password?</button>}
    {error&&<p className="login-error" role="alert">{error}</p>}{notice&&<p className="login-auth-notice" role="status">{notice}</p>}
    <button className="login-primary" disabled={busy||!configured}>{busy?<><span className="login-spinner" aria-hidden="true"/>Please wait…</>:<>{step==='sign-in'?'Sign in':step==='forgot'?'Send reset code':step==='reset'?'Update password':'Finish account setup'}<HiOutlineArrowRight aria-hidden="true"/></>}</button>
    {step!=='sign-in'&&<button type="button" className="login-text-action" onClick={()=>changeStep('sign-in')}>Back to sign in</button>}{step==='reset'&&<button type="button" className="login-text-action" onClick={()=>changeStep('forgot')}>Request a new code</button>}
    <p className="login-password-note"><HiOutlineLockClosed aria-hidden="true"/>Private access for invited teammates.</p>
  </fieldset></form>
}
