import type { ApiMember,ApiPage } from '../types/database-api'
import type { ClientAccount,ProductionAssignment,ProductionBrief, BriefData, BriefCommand, ProductionSettings, ProductionAccess, Delivery } from '../types/production'
type Send = <T>(resource: string, method?: string, body?: unknown) => Promise<T>
export function productionClient(send: Send) {
  const page = (resource: string, after?: string) => `${resource}?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`
  return {
    people:(after?:string)=>send<ApiPage<ApiMember>>(page('people',after)),
    clients:(after?:string)=>send<ApiPage<ClientAccount>>(page('clients',after)),
    createClient:(name:string)=>send<ClientAccount>('clients','POST',{name}),
    updateClient:(id:string,input:{name:string;archived:boolean;version:number})=>send<ClientAccount>(`clients/${encodeURIComponent(id)}`,'PATCH',input),
    assign:(briefId:string,input:{version:number;requestId:string;assignments:Pick<ProductionAssignment,'userId'|'role'>[]})=>send<ProductionBrief>(`briefs/${encodeURIComponent(briefId)}/crew`,'POST',input),
    access: () => send<ProductionAccess>('access'), settings: () => send<ProductionSettings>('settings'),
    saveSettings: (input: ProductionSettings) => send<ProductionSettings>('settings', 'PATCH', input),
    list: (after?: string) => send<ApiPage<ProductionBrief>>(page('briefs', after)),
    get: (id: string) => send<ProductionBrief>(`briefs/${encodeURIComponent(id)}`),
    create: (data: BriefData, requestId: string) => send<ProductionBrief>('briefs', 'POST', { data, requestId }),
    save: (id: string, data: BriefData, version: number, requestId: string) => send<ProductionBrief>(`briefs/${encodeURIComponent(id)}`, 'PATCH', { data, version, requestId }),
    action: (id: string, command: BriefCommand) => send<ProductionBrief>(`briefs/${encodeURIComponent(id)}/actions`, 'POST', command),
    deliveries: (after?: string) => send<ApiPage<Delivery>>(page('deliveries', after)),
    retry: (id: string) => send<{ id: string }>(`deliveries/${encodeURIComponent(id)}/retry`, 'POST', {}),
    attach: (briefId: string, input: { id: string; name: string; contentType: string; size: number }) => send<{ id: string; url: string; fields: Record<string, string> }>(`briefs/${encodeURIComponent(briefId)}/attachments`, 'POST', input),
    complete: (briefId: string, id: string) => send<ProductionBrief>(`briefs/${encodeURIComponent(briefId)}/attachments/${encodeURIComponent(id)}/complete`, 'POST', {}),
    discard: (briefId: string, id: string) => send<{ id: string }>(`briefs/${encodeURIComponent(briefId)}/attachments/${encodeURIComponent(id)}`, 'DELETE'),
    download: (briefId: string, id: string) => send<{ url: string; expiresIn: number }>(`briefs/${encodeURIComponent(briefId)}/attachments/${encodeURIComponent(id)}`),
  }
}
export type ProductionClient = ReturnType<typeof productionClient>
