'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import {createDatabaseApiClient} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import {emailStatus} from '../../auth/emailVerification'
import AuthLayout from '../LogIn/AuthLayout'
import NameStep from './NameStep'
import OrganizationStep from './OrganizationStep'
import VerifyEmailStep from './VerifyEmailStep'
type Step='name'|'verify'|'organization'
const titles:Record<Step,string>={name:'Welcome to StudioStack.',verify:'Check your email.',organization:'Find your organization.'}
const descriptions:Record<Step,string>={name:'Confirm the name your team sees on reservations, shoots and reports.',verify:'',organization:'Search for your studio, club or agency.'}
/** First run for a new account: confirm the name, verify the sign-in email, then join an organization. */
export default function Welcome({getAccessToken,onFinished,onSignOut}:{getAccessToken:()=>Promise<string>;onFinished:(organizationId:string)=>Promise<void>;onSignOut:()=>void}) {
  const api=useMemo(()=>createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken}),[getAccessToken])
  const [account,setAccount]=useState<{name:string;email:string;verified:boolean;skipVerify:boolean}|null>(null),[step,setStep]=useState<Step>('name'),[title,setTitle]=useState(titles.name),[error,setError]=useState('')
  useEffect(()=>{let active=true
    Promise.all([api.me(),emailStatus(getAccessToken)]).then(([user,status])=>{if(!active)return
      // Registration stores the sign-in label, which is often the email; ask for a real name instead.
      const name=user.displayName&&user.displayName!==status.email?user.displayName:''
      setAccount({name,email:status.email,verified:status.verified,skipVerify:status.verified})}).catch(()=>{if(active)setError('Your account could not be loaded. Refresh to try again.')})
    return()=>{active=false}},[api,getAccessToken])
  // The step count is fixed at arrival so verifying mid-flow doesn't renumber the steps.
  const steps:Step[]=account?.skipVerify?['name','organization']:['name','verify','organization']
  const go=(next:Step)=>{setStep(next);setTitle(titles[next])}
  const onTitle=useCallback((value:string)=>setTitle(value),[])
  const finish=useCallback(async(organizationId:string)=>{await api.completeOnboarding();await onFinished(organizationId)},[api,onFinished])
  const index=steps.indexOf(step)
  return <AuthLayout className="welcome-page">
    <span className="login-section-number">Step {index+1} of {steps.length}</span>
    <div className="welcome-progress" aria-hidden="true">{steps.map((s,i)=><span key={s} className={i<=index?'is-done':undefined}/>)}</div>
    <h1 id="login-title">{title}</h1>
    {step==='verify'?<p className="login-description">We sent a 6-digit code to <strong>{account?.email}</strong>.</p>:title===titles[step]&&<p className="login-description">{descriptions[step]}</p>}
    {error&&<p className="login-error" role="alert">{error}</p>}
    {!account?!error&&<p className="login-security-note" role="status">Loading your account…</p>
      :step==='name'?<NameStep initialName={account.name} email={account.email} onSignOut={onSignOut} onSave={async name=>{await api.register(name);setAccount({...account,name});go(account.verified?'organization':'verify')}}/>
      :step==='verify'?<VerifyEmailStep email={account.email} getAccessToken={getAccessToken} onBack={()=>go('name')} onVerified={()=>{setAccount({...account,verified:true});go('organization')}}/>
      :<OrganizationStep api={api} onJoined={finish} onTitle={onTitle} onBack={()=>go('name')}/>}
  </AuthLayout>
}
