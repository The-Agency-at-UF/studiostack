import type {ApiPage} from '../types/database-api'
import type {AppAlert,AlertPreferences} from '../types/alerts'
import {pageQuery,type Send} from './scoped'
export function alertClient(send:Send){return {
 list:(after?:string)=>send<ApiPage<AppAlert>>(pageQuery(after)),
 preferences:()=>send<AlertPreferences>('/preferences'),
 updatePreferences:(input:AlertPreferences)=>send<AlertPreferences>('/preferences','PATCH',input),
 read:(id:string)=>send<AppAlert>('/'+encodeURIComponent(id)+'/read','POST',{}),
}}
