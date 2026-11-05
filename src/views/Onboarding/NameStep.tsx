import {useState} from 'react'
import WelcomeActions from './WelcomeActions'
/** Confirms the name teammates see on reservations, shoots and reports. */
export default function NameStep({initialName,email,onSave,onSignOut}:{initialName:string;email:string;onSave:(name:string)=>Promise<void>;onSignOut:()=>void}) {
  const [name,setName]=useState(initialName),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  return <form className="login-password-form welcome-form" noValidate onSubmit={e=>{e.preventDefault();const value=name.trim()
    if(!value){setError('Enter the name your team knows you by.');return}
    setBusy(true);setError('');onSave(value).catch(()=>setError('Your name could not be saved. Try again.')).finally(()=>setBusy(false))}}>
    <label>Your name<input value={name} onChange={e=>{setName(e.target.value);setError('')}} maxLength={120} autoComplete="name" aria-invalid={Boolean(error)} aria-describedby={error?'welcome-name-error':undefined} autoFocus/></label>
    {error&&<p id="welcome-name-error" className="login-error" role="alert">{error}</p>}
    {email&&<label>Email<input value={email} readOnly/></label>}
    <WelcomeActions primary={busy?'Saving…':'Continue'} busy={busy} secondary={<button type="button" className="login-text-action" onClick={onSignOut}>Sign out</button>}/>
  </form>
}
