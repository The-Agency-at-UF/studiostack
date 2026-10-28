'use client'
import {Suspense} from 'react'
import CheckInOut from '../../src/views/Reservation/CheckInOut'
import LiveFulfillment from '../../src/views/Equipment/Fulfillment'
import {useAppSession} from '../../src/context/AppSessionContext'
export default function CheckInOutPage(){const session=useAppSession();return session.mode==='authenticated'?<LiveFulfillment/>:<Suspense><CheckInOut/></Suspense>}
