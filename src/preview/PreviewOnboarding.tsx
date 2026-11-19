'use client'
import Link from 'next/link'
import {useAppSession} from '../context/AppSessionContext'
export default function PreviewOnboarding(){const session=useAppSession();return session.mode==='preview'&&!session.organizations?.length?<section className="production-settings"><h2>New account setup</h2><Link href="/welcome/">Continue to the current onboarding flow</Link></section>:null}
