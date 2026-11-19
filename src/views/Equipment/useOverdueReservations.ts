'use client'
import {useEffect,useState} from 'react'
import {allPages,useLiveOrganization} from './live'
import type {EquipmentReservation} from '../../types/equipment'

/** A confirmed checkout past its return time. Matches the overdue alert sweep in backend/alerts/records.ts. */
export const isOverdueReservation=(r:EquipmentReservation,now=Date.now())=>r.status==='confirmed'&&r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<now

const REFRESH_MS=60000

/** Counts the overdue reservations the current member can see. Reloads on navigation (`refreshKey`) and every minute; failures keep the last count. */
export function useOverdueReservations(refreshKey?:string){
  const context=useLiveOrganization(),api=context?.api,organizationId=context?.organization.id
  const [count,setCount]=useState(0)
  useEffect(()=>{
    if(!api||!organizationId){setCount(0);return}
    let active=true
    const load=()=>allPages(after=>api.reservations(organizationId,{limit:100,after})).then(rows=>{if(active)setCount(rows.filter(r=>isOverdueReservation(r)).length)}).catch(()=>{/* Keep the last count; the Reservations page reports load errors. */})
    void load()
    const timer=setInterval(load,REFRESH_MS)
    return()=>{active=false;clearInterval(timer)}
  },[api,organizationId,refreshKey])
  return count
}
