'use client'

import InvitationInbox from '../../src/views/Accounts/InvitationInbox'
import {useState} from 'react'
import PasswordForm,{type PasswordFormStep} from '../../src/views/LogIn/PasswordForm'
import LogIn from '../../src/views/LogIn/LogIn'
import { useAppSession } from '../../src/context/AppSessionContext'
import { loginProviders } from '../../src/auth/providers'

export default function LoginPage() {
  const session = useAppSession(),[step,setStep]=useState<PasswordFormStep>('sign-in')
  const headings={'sign-in':'Welcome back.',forgot:'Reset your password.',reset:'Check your email.','new-password':'Choose a password.'}
  const descriptions={'sign-in':'Sign in to access your organization’s workspace.',forgot:'We’ll send a reset code to your verified email.',reset:'Enter your email code and choose a new password.','new-password':'Finish setting up your invited account.'}
  return <LogIn accessHeading={headings[step]} accessDescription={descriptions[step]} hideUnavailableProviders accountSignIn={<PasswordForm onStepChange={setStep} configured={session.configured} onAuthenticated={async user=>{await session.completeSignIn?.(user)}} onBusyChange={session.setAuthenticating}/>} accountActions={session.mode==='authenticated'&&session.getAccessToken?<InvitationInbox getAccessToken={session.getAccessToken} onAccepted={session.refreshOrganizations}/>:undefined} onSignIn={provider => session.signIn?.(provider)} providers={loginProviders()} onPreview={() => session.openPreview?.()} onSignOut={session.signOut}
    busy={session.busy} error={session.authError} configured={session.configured} authenticated={session.mode === 'authenticated'} label={session.email} organizations={session.organizations} />
}
