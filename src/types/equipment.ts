import type {ApiEquipment,ApiReservation,CreateReservation} from './database-api'
import type {VersionedRequest} from './accounts'
export const equipmentConditions=['excellent','good','fair','damaged']as const
export type EquipmentCondition=typeof equipmentConditions[number]
export interface EquipmentRecord extends ApiEquipment {condition:EquipmentCondition;version:number;checkedOut:boolean}
export interface EquipmentReservation extends ApiReservation {version:number;fulfillmentStatus:'reserved'|'checked_out'|'returned';checkedOutAt:string|null;returnedAt:string|null}
export interface ItemCondition {equipmentId:string;condition:EquipmentCondition;notes:string}
export interface EditReservation extends CreateReservation {version:number}
export interface FulfillReservation extends VersionedRequest {conditions:ItemCondition[]}
export interface EquipmentReport {id:string;equipmentId:string;reservationId:string|null;reportedBy:string;title:string;description:string;severity:'low'|'medium'|'high';status:'open'|'in_progress'|'resolved';resolution:string;resolvedBy:string|null;resolvedAt:string|null;version:number;createdAt:string;updatedAt:string}
export interface CreateEquipmentReport {equipmentId:string;reservationId?:string;title:string;description:string;severity:EquipmentReport['severity'];requestId:string}
export interface UpdateEquipmentReport extends VersionedRequest {status:EquipmentReport['status'];resolution:string;restoreService:boolean;condition?:EquipmentCondition}
export interface EquipmentEvent {id:string;actorName:string;reservationId:string|null;equipmentId:string|null;reportId:string|null;kind:string;details:Record<string,unknown>;createdAt:string}
export interface EquipmentAvailability {id:string;equipmentIds:string[];startsAt:string;endsAt:string;fulfillmentStatus:'reserved'|'checked_out'}
