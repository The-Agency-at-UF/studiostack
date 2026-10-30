import type {ApiPage} from '../types/database-api'
import type {EditReservation,EquipmentAvailability,EquipmentEvent,EquipmentReservation,FulfillReservation} from '../types/equipment'
type Send=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function equipmentClient(send:Send){const reservation=(id:string)=>`reservations/${encodeURIComponent(id)}`;return {
  edit:(id:string,input:EditReservation)=>send<EquipmentReservation>(reservation(id),'PATCH',input),
  checkout:(id:string,input:FulfillReservation)=>send<EquipmentReservation>(`${reservation(id)}/checkout`,'POST',input),
  return:(id:string,input:FulfillReservation)=>send<EquipmentReservation>(`${reservation(id)}/return`,'POST',input),
  activity:(id:string,after?:string)=>send<ApiPage<EquipmentEvent>>(`${reservation(id)}/activity?${new URLSearchParams({limit:'100',...(after?{after}:{})})}`),
  availability:(startsAt:string,endsAt:string,after?:string)=>send<ApiPage<EquipmentAvailability>>(`availability?${new URLSearchParams({startsAt,endsAt,limit:'100',...(after?{after}:{})})}`),
}}
export type EquipmentClient=ReturnType<typeof equipmentClient>
