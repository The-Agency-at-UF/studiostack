'use client'

import {useRouter} from 'next/navigation'
import {useEffect,useRef} from 'react'
import Welcome from '../../src/views/Onboarding/Welcome'
import {useAppSession} from '../../src/context/AppSessionContext'

export default function WelcomePage() {
  const session=useAppSession(),router=useRouter(),finishing=useRef(false),done=session.mode==='authenticated'&&session.needsWelcome===false
  // An account that is already set up has nothing to do here.
  useEffect(()=>{if(done&&!finishing.current)router.replace('/')},[done,router])
  if(session.mode!=='authenticated'||!session.getAccessToken||done&&!finishing.current)return null
  return <Welcome getAccessToken={session.getAccessToken} onSignOut={()=>void session.signOut?.()} onFinished={async organizationId=>{
    finishing.current=true
    await session.refreshOrganizations?.();session.setSelectedOrganizationId?.(organizationId);session.markOnboarded?.();router.replace('/production/')}}/>
}
