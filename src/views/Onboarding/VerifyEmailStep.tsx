import {useEffect,useRef,useState} from 'react'
import {confirmEmailCode,emailCodeError,sendEmailCode} from '../../auth/emailVerification'
import WelcomeActions from './WelcomeActions'
const length=6
/** Sends a code to the sign-in email on arrival and confirms it; joining an organization needs a verified email. */
export default function VerifyEmailStep({email,getAccessToken,onVerified,onBack}:{email:string;getAccessToken:()=>Promise<string>;onVerified:()=>void;onBack:()=>void}) {
  const [digits,setDigits]=useState<string[]>(Array(length).fill('')),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const boxes=useRef<(HTMLInputElement|null)[]>([]),sent=useRef(false)
  const send=()=>{setError('');setNotice('');return sendEmailCode(getAccessToken).then(()=>setNotice(`Code sent to ${email}.`)).catch(e=>setError(emailCodeError(e,true)))}
  useEffect(()=>{if(sent.current)return;sent.current=true;void send()},[])// eslint-disable-line react-hooks/exhaustive-deps
  function fill(at:number,value:string){const next=[...digits],chars=value.replace(/\D/g,'').slice(0,length-at).split('')
    if(!chars.length){next[at]='';setDigits(next);return}
    chars.forEach((c,i)=>{next[at+i]=c});setDigits(next);setError('');boxes.current[Math.min(at+chars.length,length-1)]?.focus()}
  return <form className="login-password-form welcome-form" noValidate onSubmit={e=>{e.preventDefault();const code=digits.join('')
    if(code.length<length){setError('Enter all 6 digits from the email.');return}
    setBusy(true);setError('');confirmEmailCode(getAccessToken,code).then(onVerified).catch(e=>{setError(emailCodeError(e));setBusy(false)})}}>
    <fieldset>
      <legend className="welcome-legend">Verification code</legend>
      <div className="welcome-code">{digits.map((digit,i)=><input key={i} ref={el=>{boxes.current[i]=el}} value={digit} inputMode="numeric" autoComplete={i===0?'one-time-code':'off'} aria-label={`Digit ${i+1}`} aria-invalid={Boolean(error)} autoFocus={i===0}
        onChange={e=>fill(i,e.target.value)} onPaste={e=>{e.preventDefault();fill(i,e.clipboardData.getData('text'))}}
        onKeyDown={e=>{if(e.key==='Backspace'&&!digit&&i>0)boxes.current[i-1]?.focus()}}/>)}</div>
    </fieldset>
    {error?<p className="login-error" role="alert">{error}</p>:notice&&<p className="login-field-hint" role="status">{notice}</p>}
    <WelcomeActions primary={busy?'Verifying…':'Verify email'} busy={busy} secondary={<span className="welcome-links">
      <button type="button" className="login-text-action" onClick={onBack}>Back</button>
      <button type="button" className="login-text-action" onClick={()=>{setDigits(Array(length).fill(''));void send()}}>Send another code</button></span>}/>
  </form>
}
