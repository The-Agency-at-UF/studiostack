'use client'
import CreateReservation from '../../src/views/Reservation/CreateReservation'
import LiveReservations from '../../src/views/Equipment/Reservations'
import {useAppSession} from '../../src/context/AppSessionContext'
export default function CreateReservationPage(){const session=useAppSession();return session.mode==='authenticated'?<LiveReservations create/>:<CreateReservation/>}
