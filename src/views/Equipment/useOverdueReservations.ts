'use client'
import {useEffect,useRef,useState} from 'react'
import {allPages,useLiveOrganization} from './live'
import type {EquipmentReservation} from '../../types/equipment'

/** A confirmed checkout past its return time. Matches the overdue alert sweep in backend/alerts/records.ts. */
export const isOverdueReservation=(r:EquipmentReservation,now=Date.now())=>r.status==='confirmed'&&r.fulfillmentStatus==='checked_out'&&Date.parse(r.endsAt)<now

const REFRESH_MS=60000

/**
 * Counts the overdue reservations the current member can see. Reloads on navigation (`refreshKey`) and every minute.
 * A failure keeps the last known count; with no count yet it returns null ("unknown"), never 0.
 */
export function useOverdueReservations(refreshKey?:string):number|null{
  const context=useLiveOrganization(),api=context?.api,organizationId=context?.organization.id
  const [count,setCount]=useState<number|null>(0)
  // Whether this organization's count has loaded at least once; until then a failure means "unknown".
  const known=useRef<string|undefined>(undefined)
  useEffect(()=>{
    if(!api||!organizationId){setCount(0);return}
    let active=true
    const load=()=>allPages(after=>api.reservations(organizationId,{limit:100,after})).then(rows=>{if(active){known.current=organizationId;setCount(rows.filter(r=>isOverdueReservation(r)).length)}}).catch(()=>{if(active&&known.current!==organizationId)setCount(null)})
    void load()
    const timer=setInterval(load,REFRESH_MS)
    return()=>{active=false;clearInterval(timer)}
  },[api,organizationId,refreshKey])
  return count
}
