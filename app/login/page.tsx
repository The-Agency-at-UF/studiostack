'use client'

import LogIn from '../../src/views/LogIn/LogIn'
import { useAppSession } from '../../src/context/AppSessionContext'

export default function LoginPage() {
  const { setEmail, setIsAdmin } = useAppSession()
  return <LogIn setEmail={setEmail} setIsAdmin={setIsAdmin} />
}
