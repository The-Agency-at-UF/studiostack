'use client'

import {useRouter} from 'next/navigation'
import Welcome from '../../src/views/Onboarding/Welcome'
import {useAppSession} from '../../src/context/AppSessionContext'

export default function WelcomePage() {
  const session=useAppSession(),router=useRouter()
  if(session.mode!=='authenticated'||!session.getAccessToken)return null
  return <Welcome getAccessToken={session.getAccessToken} onSignOut={()=>void session.signOut?.()} onFinished={async organizationId=>{
    await session.refreshOrganizations?.();session.setSelectedOrganizationId?.(organizationId);router.replace('/production/')}}/>
}
