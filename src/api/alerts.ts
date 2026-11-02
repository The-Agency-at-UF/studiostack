import type {ApiPage} from '../types/database-api'
import type {AppAlert,AlertPreferences} from '../types/alerts'
type Send=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function alertClient(send:Send){return {
 list:(after?:string)=>send<ApiPage<AppAlert>>('?'+new URLSearchParams({limit:'100',...(after?{after}:{})})),
 preferences:()=>send<AlertPreferences>('/preferences'),
 updatePreferences:(input:AlertPreferences)=>send<AlertPreferences>('/preferences','PATCH',input),
 read:(id:string)=>send<AppAlert>('/'+encodeURIComponent(id)+'/read','POST',{}),
}}
