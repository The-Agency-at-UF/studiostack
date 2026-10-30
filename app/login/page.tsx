'use client'

import InvitationInbox from '../../src/views/Accounts/InvitationInbox'
import LogIn from '../../src/views/LogIn/LogIn'
import { useAppSession } from '../../src/context/AppSessionContext'
import { loginProviders } from '../../src/auth/providers'

export default function LoginPage() {
  const session = useAppSession()
  return <LogIn accountActions={session.mode==='authenticated'&&session.getAccessToken?<InvitationInbox getAccessToken={session.getAccessToken} onAccepted={session.refreshOrganizations}/>:undefined} onSignIn={provider => session.signIn?.(provider)} providers={loginProviders()} onPreview={() => session.openPreview?.()} onSignOut={session.signOut}
    busy={session.busy} error={session.authError} configured={session.configured} authenticated={session.mode === 'authenticated'} label={session.email} organizations={session.organizations} />
}
