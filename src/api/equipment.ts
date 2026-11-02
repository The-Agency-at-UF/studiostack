import type {ApiPage} from '../types/database-api'
import type {EditReservation,EquipmentAvailability,EquipmentEvent,EquipmentReservation,FulfillReservation} from '../types/equipment'
import {pageQuery,type Send} from './scoped'
export function equipmentClient(send:Send){const reservation=(id:string)=>`reservations/${encodeURIComponent(id)}`;return {
  edit:(id:string,input:EditReservation)=>send<EquipmentReservation>(reservation(id),'PATCH',input),
  checkout:(id:string,input:FulfillReservation)=>send<EquipmentReservation>(`${reservation(id)}/checkout`,'POST',input),
  return:(id:string,input:FulfillReservation)=>send<EquipmentReservation>(`${reservation(id)}/return`,'POST',input),
  activity:(id:string,after?:string)=>send<ApiPage<EquipmentEvent>>(`${reservation(id)}/activity${pageQuery(after)}`),
  availability:(startsAt:string,endsAt:string,after?:string)=>send<ApiPage<EquipmentAvailability>>(`availability?${new URLSearchParams({startsAt,endsAt,limit:'100',...(after?{after}:{})})}`),
}}
