'use client'
import {useEffect,useRef,useState} from 'react'
import type {FormEvent} from 'react'
import {HiOutlineArrowRight,HiOutlineEye,HiOutlineEyeSlash} from 'react-icons/hi2'
import {passwordSignIn,invitationPassword,createAccount,confirmAccount,resendAccountCode,requestPasswordReset,confirmPasswordReset,passwordError,passwordRules,type PasswordStep} from '../../auth/password'
import type {SignedInUser} from '../../auth/cognito'
export type PasswordFormStep='sign-in'|'sign-up'|'confirm-sign-up'|'forgot'|'reset'|'new-password'
const titles:Record<PasswordFormStep,string>={'sign-in':'Sign in','sign-up':'Create your account','confirm-sign-up':'Verify your email',forgot:'Reset your password',reset:'Check your email','new-password':'Choose your password'}
const actions:Record<PasswordFormStep,string>={'sign-in':'Sign in','sign-up':'Create account','confirm-sign-up':'Verify email',forgot:'Send reset code',reset:'Update password','new-password':'Finish account setup'}
type Field='email'|'code'|'password'|'confirmation'
type Values=Record<Field,string>
const fieldOrder:Field[]=['email','code','password','confirmation']
const passwordRuleText='Use at least 8 characters, one uppercase letter and one special character.'
function stepFields(step:PasswordFormStep):Field[]{
  if(step==='forgot')return ['email']
  if(step==='confirm-sign-up')return ['email','code']
  if(step==='reset')return ['email','code','password','confirmation']
  if(step==='new-password')return ['password','confirmation']
  return step==='sign-up'?['email','password','confirmation']:['email','password']
}
function fieldError(field:Field,values:Values,step:PasswordFormStep){
  const choosing=step==='reset'||step==='new-password'||step==='sign-up'
  if(field==='email'){const email=values.email.trim();return !email?'Enter your email address.':/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'':'Enter a valid email address, like name@example.com.'}
  if(field==='code'){const code=values.code.trim();return !code?'Enter the code from your email.':/^\d+$/.test(code)?'':'The code should contain numbers only.'}
  if(field==='password')return !values.password?(choosing?'Choose a password.':'Enter your password.'):choosing&&!passwordRules(values.password)?passwordRuleText:''
  return !values.confirmation?'Re-enter your password to confirm it.':values.confirmation!==values.password?'The passwords do not match.':''
}
const serverField:Record<string,Field>={UsernameExistsException:'email',InvalidPasswordException:'password',CodeMismatchException:'code',ExpiredCodeException:'code'}
export default function PasswordForm({onAuthenticated,onBusyChange,onStepChange,configured=true}:{onAuthenticated:(user:SignedInUser)=>Promise<void>;onBusyChange?:(busy:boolean)=>void;onStepChange?:(step:PasswordFormStep)=>void;configured?:boolean}) {
  const [step,setStep]=useState<PasswordFormStep>('sign-in'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[code,setCode]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[errors,setErrors]=useState<Partial<Record<Field,string>>>({}),[touched,setTouched]=useState<Partial<Record<Field,boolean>>>({}),[hydrated,setHydrated]=useState(false)
  const emailInput=useRef<HTMLInputElement>(null),passwordInput=useRef<HTMLInputElement>(null),codeInput=useRef<HTMLInputElement>(null),confirmInput=useRef<HTMLInputElement>(null)
  const inputs:Record<Field,typeof emailInput>={email:emailInput,code:codeInput,password:passwordInput,confirmation:confirmInput}
  const values:Values={email,code,password,confirmation}
  const emailLocked=step==='new-password'||step==='reset'||step==='confirm-sign-up'
  const verifying=step==='confirm-sign-up',choosingPassword=step==='reset'||step==='new-password'||step==='sign-up'
  // Until React attaches onSubmit, a native submit would put the password in the URL.
  useEffect(()=>setHydrated(true),[])
  useEffect(()=>{(step==='reset'||step==='confirm-sign-up'?codeInput:step==='new-password'?passwordInput:emailInput).current?.focus()},[step])
  function changeStep(next:PasswordFormStep){setStep(next);onStepChange?.(next);setError('');setErrors({});setTouched({});setNotice('');setPassword('');setConfirmation('');setCode('');setVisible(false)}
  async function finish(result:PasswordStep){
    setPassword('');setConfirmation('');setErrors({});setTouched({})
    if(result.step==='new-password')changeStep('new-password')
    else if(result.step==='reset-password')changeStep('forgot')
    else if(result.step==='confirm-sign-up'){changeStep('confirm-sign-up');setNotice('Enter your email verification code, or request a new one below.')}
    else await onAuthenticated(result.user)
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy)return;setError('');setNotice('')
    const checked=stepFields(step).filter(field=>field!=='email'||!emailLocked),found:Partial<Record<Field,string>>={}
    for(const field of checked){const message=fieldError(field,values,step);if(message)found[field]=message}
    setErrors(found);setTouched(Object.fromEntries(checked.map(field=>[field,true])))
    const first=fieldOrder.find(field=>found[field]);if(first){inputs[first].current?.focus();return}
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
    }catch(e){showServerError(e)}finally{setBusy(false);onBusyChange?.(false)}
  }
  function showServerError(e:unknown){
    const field=serverField[(e as {name?:string})?.name??''],visible=field&&stepFields(step).includes(field)&&!(field==='email'&&emailLocked)
    if(!visible){setError(passwordError(e));return}
    setErrors(current=>({...current,[field]:passwordError(e)}));setTouched(current=>({...current,[field]:true}));inputs[field].current?.focus()
  }
  function update(field:Field,value:string){
    const setters:Record<Field,(value:string)=>void>={email:setEmail,code:setCode,password:setPassword,confirmation:setConfirmation},next={...values,[field]:value}
    setters[field](value);setError('')
    setErrors(current=>{const updated={...current};for(const name of [field,...(field==='password'&&touched.confirmation?['confirmation' as const]:[])])if(touched[name])updated[name]=fieldError(name,next,step);return updated})
  }
  function blur(field:Field){if(busy)return;const value=values[field];if(!value&&!touched[field])return;setTouched(current=>({...current,[field]:true}));setErrors(current=>({...current,[field]:fieldError(field,values,step)}))}
  const invalid=(field:Field)=>Boolean(touched[field]&&errors[field])
  const describedBy=(field:Field,...extra:(string|false|undefined)[])=>[invalid(field)&&`studio-${field}-error`,...extra].filter(Boolean).join(' ')||undefined
  const fieldMessage=(field:Field)=>invalid(field)?<p id={`studio-${field}-error`} className="login-field-error">{errors[field]}</p>:null
  async function resend(){
    if(busy)return;setError('');setNotice('');setBusy(true);onBusyChange?.(true)
    try{await resendAccountCode(email);setCode('');setNotice('A new verification code was sent to your email.');codeInput.current?.focus()}
    catch(e){showServerError(e)}finally{setBusy(false);onBusyChange?.(false)}
  }
  const passwordLabel=choosingPassword&&step!=='sign-up'?'New password':'Password'
  return <form className="login-password-form" method="post" onSubmit={submit} noValidate aria-label={step==='sign-up'||verifying?'StudioStack account sign-up':'StudioStack account sign-in'}><fieldset disabled={busy||!configured||!hydrated}>
    {!onStepChange&&step!=='sign-in'&&<div className="login-step-heading"><h2>{titles[step]}</h2></div>}
    <div className="login-field"><label htmlFor="studio-email">Email<input id="studio-email" ref={emailInput} name="email" type="email" autoComplete="username" value={email} maxLength={254} readOnly={emailLocked} aria-invalid={invalid('email')||undefined} aria-describedby={describedBy('email')} onChange={e=>update('email',e.target.value)} onBlur={()=>blur('email')} required/></label>{fieldMessage('email')}</div>
    {(step==='reset'||verifying)&&<div className="login-field"><label htmlFor="studio-code">{verifying?'Email verification code':'Email reset code'}<input id="studio-code" ref={codeInput} name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={12} value={code} aria-invalid={invalid('code')||undefined} aria-describedby={describedBy('code')} onChange={e=>update('code',e.target.value)} onBlur={()=>blur('code')} required/></label>{fieldMessage('code')}</div>}
    {step!=='forgot'&&!verifying&&<><div className="login-password-field"><label htmlFor="studio-password">{passwordLabel}</label><span className="login-password-input"><input id="studio-password" ref={passwordInput} name="password" type={visible?'text':'password'} autoComplete={choosingPassword?'new-password':'current-password'} aria-invalid={invalid('password')||undefined} aria-describedby={describedBy('password',choosingPassword&&'studio-password-rules')} value={password} maxLength={256} minLength={choosingPassword?8:undefined} onChange={e=>update('password',e.target.value)} onBlur={()=>blur('password')} required/><button className="login-password-toggle" type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible?<HiOutlineEyeSlash/>:<HiOutlineEye/>}</button></span>{fieldMessage('password')}</div>
      {choosingPassword&&<><div className="login-field"><label htmlFor="studio-confirm">{step==='sign-up'?'Confirm password':'Confirm new password'}<input id="studio-confirm" ref={confirmInput} name="confirmation" type={visible?'text':'password'} autoComplete="new-password" value={confirmation} aria-invalid={invalid('confirmation')||undefined} aria-describedby={describedBy('confirmation')} onChange={e=>update('confirmation',e.target.value)} onBlur={()=>blur('confirmation')} required/></label>{fieldMessage('confirmation')}</div><p id="studio-password-rules" className="login-field-hint">At least 8 characters, one uppercase letter and one special character.</p></>}
    </>}
    {step==='sign-in'&&<button type="button" className="login-forgot-action" onClick={()=>changeStep('forgot')}>Forgot password?</button>}
    {step==='sign-up'&&<p className="login-field-hint">Create your account and verify your email. Then join your workspace with an invitation, your school or work email, or a join code from your administrator.</p>}
    {error&&<p className="login-error" role="alert">{error}</p>}{notice&&<p className="login-auth-notice" role="status">{notice}</p>}
    <button className="login-primary" disabled={busy||!configured}>{busy?<><span className="login-spinner" aria-hidden="true"/>Please wait…</>:<>{actions[step]}<HiOutlineArrowRight aria-hidden="true"/></>}</button>
    {step==='sign-in'&&<p className="login-account-switch">New to StudioStack? <button type="button" className="login-text-action" onClick={()=>changeStep('sign-up')}>Sign up</button></p>}
    {step!=='sign-in'&&<button type="button" className="login-text-action" onClick={()=>changeStep('sign-in')}>Back to sign in</button>}
    {step==='reset'&&<button type="button" className="login-text-action" onClick={()=>changeStep('forgot')}>Request a new code</button>}
    {verifying&&<><button type="button" className="login-text-action" onClick={()=>void resend()}>Resend verification code</button><button type="button" className="login-text-action" onClick={()=>changeStep('sign-up')}>Use another email</button></>}
  </fieldset></form>
}
