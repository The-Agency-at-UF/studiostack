import type {EquipmentReservation} from '../types/equipment'

/** A confirmed booking whose return time passed without the gear ever being picked up. */
export const isMissed=(r:EquipmentReservation,now=Date.now())=>r.status!=='cancelled'&&r.fulfillmentStatus==='reserved'&&Date.parse(r.endsAt)<now

/** The next half hour, moved to 10 AM when that would land outside 8 AM–6 PM, so a new booking never defaults to a midnight pickup. */
export function defaultPickup(now=new Date()){const d=new Date(Math.ceil((now.getTime()+15*60000)/1800000)*1800000);if(d.getHours()>=18||(d.getHours()===17&&d.getMinutes()>30)){d.setDate(d.getDate()+1);d.setHours(10,0,0,0)}else if(d.getHours()<8){d.setHours(10,0,0,0)}return d}
