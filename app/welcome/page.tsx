'use client'

import {useRouter} from 'next/navigation'
import {useEffect,useMemo,useRef} from 'react'
import PreviewControls from '../../src/components/PreviewControls'
import {createPreviewDatabaseApi} from '../../src/preview/database'
import Welcome from '../../src/views/Onboarding/Welcome'
import {useAppSession} from '../../src/context/AppSessionContext'

export default function WelcomePage() {
  const session=useAppSession(),router=useRouter(),finishing=useRef(false),done=session.mode==='authenticated'&&session.needsWelcome===false
  const previewClient=useMemo(()=>session.mode==='preview'?createPreviewDatabaseApi(session.previewPersonId):undefined,[session.mode,session.previewPersonId])
  // An account that is already set up has nothing to do here.
  useEffect(()=>{if(done&&!finishing.current)router.replace('/')},[done,router])
  if(!previewClient&&(session.mode!=='authenticated'||!session.getAccessToken||done&&!finishing.current))return null
  return <>{previewClient&&<PreviewControls/>}<Welcome key={session.previewPersonId} previewClient={previewClient} getAccessToken={session.getAccessToken} onSignOut={()=>void session.signOut?.()} onFinished={async organizationId=>{
    finishing.current=true
    await session.refreshOrganizations?.();session.setSelectedOrganizationId?.(organizationId);session.markOnboarded?.();router.replace('/production/')}}/></>
}
