'use client'
import {createPreviewDatabaseApi} from './previewApi'
import {useMemo} from 'react'
import {useAppSession} from '../../context/AppSessionContext'
import {createDatabaseApiClient,DatabaseApiClientError} from '../../api/database'
import {serverMessage,type FailureKind} from '../../api/errorText'
import {authConfiguration} from '../../auth/cognito'
export {allPages} from '../../api/scoped'
export type DatabaseApi=ReturnType<typeof createDatabaseApiClient>
export function useLiveOrganization(){const session=useAppSession(),organization=session.organizations?.find(o=>o.id===session.selectedOrganizationId)??session.organizations?.[0]
  const api=useMemo(()=>session.mode==='authenticated'&&session.getAccessToken?createDatabaseApiClient({baseUrl:authConfiguration().apiUrl,getAccessToken:session.getAccessToken}):null,[session.mode,session.getAccessToken])
  const previewApi=useMemo(()=>createPreviewDatabaseApi(session.previewPersonId),[session.previewPersonId])
  if(session.mode==='preview'){if(session.previewPersonId&&session.organizations?.length===0)return null;const organization=session.organizations?.find(o=>o.id==='preview')??{id:'preview',slug:'preview',name:'Preview workspace',role:'owner' as const};return {api:previewApi,organization,admin:['owner','admin'].includes(organization.role)}}
  return api&&organization?{api,organization,admin:['owner','admin'].includes(organization.role)}:null
}
/** Equipment failures in plain words. `kind` says whether a read or a change failed, so loads never mention lost changes. */
export function equipmentError(error:unknown,kind:FailureKind='save'):string{
  const sent=serverMessage(error)
  if(sent)return sent
  if(error instanceof DatabaseApiClientError){
    const messages:Record<number,string>={
      400:'Some details weren’t accepted. Check the item, dates and required fields, then try again.',
      401:'Your session expired. Sign in again to continue.',
      403:'Your account can’t do this. Ask an organization admin for access.',
      404:'This record no longer exists. It may have been deleted or returned.',
      409:'Someone else changed this just now. Refresh, then try again.',
      429:'Too many requests. Wait a minute, then try again.',
      502:'StudioStack didn’t respond in time. Try again.',
      503:kind==='load'?'StudioStack is temporarily unavailable. Try again in a moment.':'StudioStack is temporarily unavailable. Refresh to check whether your change was saved.',
      504:'StudioStack didn’t respond in time. Try again.'
    }
    return messages[error.status]??(kind==='load'?'This couldn’t load. Try again.':'This couldn’t be saved. Refresh to check, then try again.')
  }
  if(error instanceof Error&&error.name==='PreviewError')return error.message
  if(error instanceof TypeError&&/fetch|network/i.test(error.message))return 'You appear to be offline. Check your connection, then try again.'
  return kind==='load'?'This couldn’t load. Try again.':'This couldn’t be saved. Refresh to check, then try again.'
}
