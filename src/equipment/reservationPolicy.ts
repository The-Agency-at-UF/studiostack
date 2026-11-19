import type {EquipmentReservation} from '../types/equipment'
export function isOverdue(reservation:EquipmentReservation,now=Date.now()) {
 return reservation.status==='confirmed'&&reservation.fulfillmentStatus==='checked_out'&&Date.parse(reservation.endsAt)<now
}
