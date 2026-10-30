'use client'

import InvitationInbox from '../../src/views/Accounts/InvitationInbox'
import {useState} from 'react'
import PasswordForm,{type PasswordFormStep} from '../../src/views/LogIn/PasswordForm'
import LogIn from '../../src/views/LogIn/LogIn'
import { useAppSession } from '../../src/context/AppSessionContext'
import { loginProviders } from '../../src/auth/providers'

export default function LoginPage() {
  const session = useAppSession(),[step,setStep]=useState<PasswordFormStep>('sign-in')
  const headings={'sign-in':'Welcome back.',forgot:'Reset your password.',reset:'Check your email.','new-password':'Choose a password.','sign-up':'Create your account.','confirm-sign-up':'Verify your email.'}
  const descriptions={'sign-in':'Sign in to access your organization’s workspace.',forgot:'We’ll send a reset code to your verified email.',reset:'Enter your email code and choose a new password.','new-password':'Finish setting up your invited account.','sign-up':'Join StudioStack and connect with your team.','confirm-sign-up':'Enter the verification code sent to your email.'}
  return <LogIn accessSection={step==='sign-up'?'SIGN UP / 01':step==='confirm-sign-up'?'VERIFY EMAIL / 01':'SIGN IN / 01'} accessHeading={headings[step]} accessDescription={descriptions[step]} hideUnavailableProviders accountSignIn={<PasswordForm onStepChange={setStep} configured={session.configured} onAuthenticated={async user=>{await session.completeSignIn?.(user)}} onBusyChange={session.setAuthenticating}/>} accountActions={session.mode==='authenticated'&&session.getAccessToken?<InvitationInbox getAccessToken={session.getAccessToken} onAccepted={session.refreshOrganizations}/>:undefined} onSignIn={provider => session.signIn?.(provider)} providers={loginProviders()} onPreview={() => session.openPreview?.()} onSignOut={session.signOut}
    busy={session.busy} error={session.authError} configured={session.configured} authenticated={session.mode === 'authenticated'} label={session.email} organizations={session.organizations} selectedOrganizationId={session.selectedOrganizationId} onSelectOrganization={session.setSelectedOrganizationId} />
}
