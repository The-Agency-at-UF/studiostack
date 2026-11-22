import type {EquipmentReservation} from '../types/equipment'
export function isServiceable(item:{status:string;condition?:string}) {
 return item.status==='available'&&item.condition!=='damaged'
}
export function isOverdue(reservation:EquipmentReservation,now=Date.now()) {
 return reservation.status==='confirmed'&&reservation.fulfillmentStatus==='checked_out'&&Date.parse(reservation.endsAt)<now
}
