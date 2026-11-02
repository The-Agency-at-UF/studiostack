import type {ApiPage} from '../types/database-api'
import type {CreateEquipmentReport,EquipmentEvent,EquipmentReport,UpdateEquipmentReport} from '../types/equipment'
type Send=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function reportClient(send:Send){const page=(path:string,after?:string)=>path+'?'+new URLSearchParams({limit:'100',...(after?{after}:{})});return {
 list:(after?:string)=>send<ApiPage<EquipmentReport>>(page('',after)),
 get:(id:string)=>send<EquipmentReport>(encodeURIComponent(id)),
 create:(input:CreateEquipmentReport)=>send<EquipmentReport>('','POST',input),
 update:(id:string,input:UpdateEquipmentReport)=>send<EquipmentReport>(encodeURIComponent(id),'PATCH',input),
 activity:(id:string,after?:string)=>send<ApiPage<EquipmentEvent>>(page(encodeURIComponent(id)+'/activity',after)),
 comment:(id:string,message:string,requestId:string)=>send<EquipmentEvent>(encodeURIComponent(id)+'/activity','POST',{message,requestId}),
}}
