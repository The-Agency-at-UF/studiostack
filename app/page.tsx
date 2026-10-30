'use client'
import Dashboard from '../src/views/Dashboard/Dashboard'
import LiveDashboard from '../src/views/Equipment/Dashboard'
import {useAppSession} from '../src/context/AppSessionContext'
export default function HomePage(){const session=useAppSession();return session.mode==='preview'?<Dashboard isAdmin={session.isAdmin}/>:<LiveDashboard/>}
