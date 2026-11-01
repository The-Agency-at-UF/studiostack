import {alertClient} from './alerts'
import {reportClient} from './reports'
import {equipmentClient} from './equipment'
import type {EquipmentRecord,EquipmentReservation} from '../types/equipment'
import { productionClient } from './production'
import type {OnboardingOverview,OwnAccessRequest,PendingInvitation} from '../types/accounts'
import {accountClient} from './accounts'
import type { ApiBugReport, ApiUser, ApiOrganization, ApiMember, ApiGroup, ApiPage, CreateEquipment, UpdateEquipment, CreateReservation, CreatePhotoUpload, ApiPhotoUpload, ApiCompletedPhoto, ApiPhotoDownload } from '../types/database-api'

// Coalesce only identical, currently pending reads. Never retain responses or
// share requests between identities, URLs, or fetch transports.
const pendingReads = new WeakMap<typeof fetch, Map<string, Promise<unknown>>>()
type ClientOptions = { baseUrl?: string; getAccessToken: () => Promise<string>; fetch?: typeof fetch }
type PageOptions = { limit?: number; after?: string }
function retryDelay(ms:number,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason)}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}
export class DatabaseApiClientError extends Error {
  constructor(public readonly status: number, public readonly statusText?: string, public readonly payload?: unknown) {
    super(`Database API request failed (${status}${statusText ? `: ${statusText}` : ''})`)
    this.name = 'DatabaseApiClientError'
  }
}
/** Opt-in authenticated client; never treats the preview session as proof of identity. */
export function createDatabaseApiClient(options: ClientOptions) {
  const supplied = options.baseUrl ?? process.env.NEXT_PUBLIC_DATABASE_API_URL
  if (!supplied) throw new Error('Database API URL is not configured')
  const base = new URL(supplied)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('A clean HTTPS database API URL is required')
  const send = options.fetch ?? fetch
  const path = (organizationId: string, resource: string) => `/organizations/${encodeURIComponent(organizationId)}/${resource}`
  const paged = (resource: string, page?: PageOptions) => {
    const params = new URLSearchParams()
    if (page?.limit !== undefined) params.set('limit', String(page.limit))
    if (page?.after !== undefined) params.set('after', page.after)
    return `${resource}${params.size ? `?${params}` : ''}`
  }
  async function request<T>(resource: string, method = 'GET', body?: unknown): Promise<T> {
    const token = await options.getAccessToken()
    if (!token || /\s/.test(token)) throw new Error('A real access token is required')
    const url = `${base.href.replace(/\/$/, '')}${resource}`
    let reads = pendingReads.get(send)
    if (!reads) { reads = new Map(); pendingReads.set(send, reads) }
    const key = JSON.stringify([url, token])
    if (method === 'GET') {
      const pending = reads.get(key)
      if (pending) return pending as Promise<T>
      const work = execute<T>(url, token, method, body)
      reads.set(key, work)
      try { return await work }
      finally { if (reads.get(key) === work) reads.delete(key) }
    }
    // A read begun before/during a write cannot satisfy a post-write refresh.
    reads.clear()
    try { return await execute<T>(url, token, method, body) }
    finally { reads.clear() }
  }
  async function execute<T>(url: string, token: string, method: string, body?: unknown): Promise<T> {
    // Bound the whole request, including read retries. Writes are never replayed.
    const signal = AbortSignal.timeout(method === 'GET' ? 15_000 : 30_000)
    let response: Response | undefined
    for(let attempt=0;;attempt++) {
      signal.throwIfAborted()
      try {
        response = await send(url, {
          method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
        })
      } catch (networkError) {
        if (signal.aborted || method !== 'GET' || attempt >= 2) throw networkError
        await retryDelay(500 * (2 ** attempt),signal)
        continue
      }
      if(method!=='GET'||![429,502,503,504].includes(response.status)||attempt>=3)break
      const retryAfterHeader = response.headers?.get?.('retry-after')
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN
      const delay = !Number.isNaN(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 10_000)
        : 1000 * (2 ** attempt)
      await retryDelay(delay,signal)
    }
    if (!response || !response.ok) {
      let payload: unknown
      try { payload = await response?.json() } catch { payload = undefined }
      throw new DatabaseApiClientError(response ? response.status : 0, response?.statusText, payload)
    }
    return response.json() as Promise<T>
  }
  return {
    pendingInvitations:()=>request<{items:PendingInvitation[]}>('/account/invitations'),
    acceptInvitation:(id:string,organizationId:string)=>request<{organizationId:string}>(`/account/invitations/${encodeURIComponent(id)}/accept`,'POST',{organizationId}),
    onboarding:()=>request<OnboardingOverview>('/account/onboarding'),
    joinByDomain:(organizationId:string)=>request<{organizationId:string}>('/account/onboarding/domain-joins','POST',{organizationId}),
    joinByCode:(code:string)=>request<{organizationId:string}>('/account/onboarding/code-joins','POST',{code}),
    requestAccess:(organizationId:string,message?:string)=>request<OwnAccessRequest>('/account/onboarding/access-requests','POST',message?{organizationId,message}:{organizationId}),
    withdrawAccessRequest:(id:string,organizationId:string)=>request<{id:string;status:'withdrawn'}>(`/account/onboarding/access-requests/${encodeURIComponent(id)}/withdraw`,'POST',{organizationId}),
    alerts:(org:string)=>alertClient(<T>(resource:string,method?:string,body?:unknown)=>request<T>(path(org,'alerts'+resource),method,body)),
    reports:(org:string)=>reportClient(<T>(resource:string,method?:string,body?:unknown)=>request<T>(path(org,'equipment/reports'+(resource.startsWith('?')||!resource?resource:'/'+resource)),method,body)),
    equipment:(org:string)=>equipmentClient(<T>(resource:string,method?:string,body?:unknown)=>request<T>(path(org,`equipment/${resource}`),method,body)),
    accounts: (org:string) => accountClient(<T>(resource:string,method?:string,body?:unknown)=>request<T>(path(org,`administration/${resource}`),method,body)),
    production: (org: string) => productionClient(<T>(resource: string, method?: string, body?: unknown) => request<T>(path(org, `production/${resource}`), method, body)),
    bugReports:(org:string,page?:PageOptions)=>request<ApiPage<ApiBugReport>>(paged(path(org,'bug-reports'),page)),
    submitBugReport:(org:string,input:{title:string;description:string;pagePath:string;requestId:string})=>request<{id:string}>(path(org,'bug-reports'),'POST',input),
    me: () => request<ApiUser>('/me'),
    register: (displayName?: string) => request<ApiUser>('/me', 'POST', displayName === undefined ? {} : { displayName }),
    organizations: (page?: PageOptions) => request<ApiPage<ApiOrganization>>(paged('/organizations', page)),
    members: (org: string, page?: PageOptions) => request<ApiPage<ApiMember>>(paged(path(org, 'members'), page)),
    groups: (org: string, page?: PageOptions) => request<ApiPage<ApiGroup>>(paged(path(org, 'groups'), page)),
    createGroup: (org: string, name: string) => request<ApiGroup>(path(org, 'groups'), 'POST', { name }),
    inventory: (org: string, page?: PageOptions) => request<ApiPage<EquipmentRecord>>(paged(path(org, 'inventory'), page)),
    createEquipment: (org: string, input: CreateEquipment) => request<EquipmentRecord>(path(org, 'inventory'), 'POST', input),
    updateEquipment: (org: string, itemId: string, input: UpdateEquipment) => request<EquipmentRecord>(path(org, `inventory/${encodeURIComponent(itemId)}`), 'PATCH', input),
    reservations: (org: string, page?: PageOptions) => request<ApiPage<EquipmentReservation>>(paged(path(org, 'reservations'), page)),
    reservation: (org: string, id: string) => request<EquipmentReservation>(path(org, `reservations/${encodeURIComponent(id)}`)),
    createReservation: (org: string, input: CreateReservation) => request<EquipmentReservation>(path(org, 'reservations'), 'POST', input),
    cancelReservation: (org: string, id: string) => request<EquipmentReservation>(path(org, `reservations/${encodeURIComponent(id)}/cancel`), 'POST', {}),
    createPhotoUpload: (input: CreatePhotoUpload) => request<ApiPhotoUpload>('/photos/uploads', 'POST', input),
    completePhoto: (org: string, id: string) => request<ApiCompletedPhoto>(path(org, `photos/${encodeURIComponent(id)}/complete`), 'POST', {}),
    photo: (org: string, itemId: string) => request<ApiPhotoDownload>(path(org, `inventory/${encodeURIComponent(itemId)}/photo`)),
  }
}
