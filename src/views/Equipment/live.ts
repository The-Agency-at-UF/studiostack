'use client'
import {useMemo} from 'react'
import {useAppSession} from '../../context/AppSessionContext'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {authConfiguration} from '../../auth/cognito'
import type {ApiPage} from '../../types/database-api'
export type DatabaseApi=ReturnType<typeof createDatabaseApiClient>
export function useLiveOrganization(){const session=useAppSession(),organization=session.organizations?.find(o=>o.id===session.selectedOrganizationId)??session.organizations?.[0]
  const api=useMemo(()=>session.mode==='authenticated'&&session.getAccessToken?createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}):null,[session.mode,session.getAccessToken])
  return api&&organization?{api,organization,admin:['owner','admin'].includes(organization.role)}:null
}
export async function allPages<T>(load:(after?:string)=>Promise<ApiPage<T>>){const items:T[]=[];let after:string|undefined;do{const page=await load(after);items.push(...page.items);after=page.nextCursor??undefined}while(after);return items}
export function equipmentError(error:unknown):string{
  if(error instanceof DatabaseApiClientError){
    const messages:Record<number,string>={
      400:'Check the item details, dates and required fields.',
      401:'Your session expired. Sign in again.',
      403:'Your account cannot perform this action.',
      404:'The record is unavailable.',
      409:'This action conflicts with the current records. Refresh before trying again.',
      429:'Too many requests. The service is unavailable. Please wait a moment before trying again.',
      502:'The service is unavailable. Gateway error; please refresh.',
      503:'The service is unavailable. Refresh to check whether your changes were saved.',
      504:'The service is unavailable. Database connection timed out; please retry.'
    }
    return messages[error.status]??'The service is unavailable. Refresh to check whether your changes were saved.'
  }
  return 'The service is unavailable. Refresh to check whether your changes were saved.'
}
