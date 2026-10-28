import { productionClient } from './production'
import type { ApiUser, ApiOrganization, ApiMember, ApiGroup, ApiEquipment, ApiReservation, ApiPage, CreateEquipment, UpdateEquipment, CreateReservation, CreatePhotoUpload, ApiPhotoUpload, ApiCompletedPhoto, ApiPhotoDownload } from '../types/database-api'

type ClientOptions = { baseUrl?: string; getAccessToken: () => Promise<string>; fetch?: typeof fetch }
type PageOptions = { limit?: number; after?: string }
export class DatabaseApiClientError extends Error {
  constructor(public readonly status: number) { super(`Database API request failed (${status})`) }
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
    const response = await send(`${base.href.replace(/\/$/, '')}${resource}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'omit', redirect: 'error',
    })
    if (!response.ok) throw new DatabaseApiClientError(response.status)
    return response.json() as Promise<T>
  }
  return {
    production: (org: string) => productionClient(<T>(resource: string, method?: string, body?: unknown) => request<T>(path(org, `production/${resource}`), method, body)),
    me: () => request<ApiUser>('/me'),
    register: (displayName?: string) => request<ApiUser>('/me', 'POST', displayName === undefined ? {} : { displayName }),
    organizations: (page?: PageOptions) => request<ApiPage<ApiOrganization>>(paged('/organizations', page)),
    members: (org: string, page?: PageOptions) => request<ApiPage<ApiMember>>(paged(path(org, 'members'), page)),
    groups: (org: string, page?: PageOptions) => request<ApiPage<ApiGroup>>(paged(path(org, 'groups'), page)),
    createGroup: (org: string, name: string) => request<ApiGroup>(path(org, 'groups'), 'POST', { name }),
    inventory: (org: string, page?: PageOptions) => request<ApiPage<ApiEquipment>>(paged(path(org, 'inventory'), page)),
    createEquipment: (org: string, input: CreateEquipment) => request<ApiEquipment>(path(org, 'inventory'), 'POST', input),
    updateEquipment: (org: string, itemId: string, input: UpdateEquipment) => request<ApiEquipment>(path(org, `inventory/${encodeURIComponent(itemId)}`), 'PATCH', input),
    reservations: (org: string, page?: PageOptions) => request<ApiPage<ApiReservation>>(paged(path(org, 'reservations'), page)),
    reservation: (org: string, id: string) => request<ApiReservation>(path(org, `reservations/${encodeURIComponent(id)}`)),
    createReservation: (org: string, input: CreateReservation) => request<ApiReservation>(path(org, 'reservations'), 'POST', input),
    cancelReservation: (org: string, id: string) => request<ApiReservation>(path(org, `reservations/${encodeURIComponent(id)}/cancel`), 'POST', {}),
    createPhotoUpload: (input: CreatePhotoUpload) => request<ApiPhotoUpload>('/photos/uploads', 'POST', input),
    completePhoto: (org: string, id: string) => request<ApiCompletedPhoto>(path(org, `photos/${encodeURIComponent(id)}/complete`), 'POST', {}),
    photo: (org: string, itemId: string) => request<ApiPhotoDownload>(path(org, `inventory/${encodeURIComponent(itemId)}/photo`)),
  }
}
