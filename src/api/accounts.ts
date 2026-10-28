import type {ApiPage} from '../types/database-api'
import type {ChangeMember,ChangeOrganization,ChangeTeam,InviteMember,ManagedMember,ManagedTeam,OrganizationActivity,OrganizationInvitation,OrganizationSettings,VersionedRequest} from '../types/accounts'
type Send=<T>(path:string,method?:string,body?:unknown)=>Promise<T>
export function accountClient(send:Send) {
  const page=(path:string,after?:string)=>`${path}?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`
  return {
    settings:()=>send<OrganizationSettings>('settings'),
    saveSettings:(body:ChangeOrganization)=>send<OrganizationSettings>('settings','PATCH',body),
    members:(after?:string)=>send<ApiPage<ManagedMember>>(page('members',after)),
    updateMember:(id:string,body:ChangeMember)=>send<ManagedMember>(`members/${encodeURIComponent(id)}`,'PATCH',body),
    teams:(after?:string)=>send<ApiPage<ManagedTeam>>(page('teams',after)),
    createTeam:(name:string,requestId:string)=>send<ManagedTeam>('teams','POST',{name,requestId}),
    updateTeam:(id:string,body:ChangeTeam)=>send<ManagedTeam>(`teams/${encodeURIComponent(id)}`,'PATCH',body),
    activity:(after?:string)=>send<ApiPage<OrganizationActivity>>(page('activity',after)),
    invitations:(after?:string)=>send<ApiPage<OrganizationInvitation>>(page('invitations',after)),
    invite:(body:InviteMember)=>send<OrganizationInvitation>('invitations','POST',body),
    revokeInvitation:(id:string,body:VersionedRequest)=>send<OrganizationInvitation>(`invitations/${encodeURIComponent(id)}/revoke`,'POST',body),
    retryInvitation:(id:string,body:VersionedRequest)=>send<OrganizationInvitation>(`invitations/${encodeURIComponent(id)}/retry`,'POST',body),
  }
}
export type AccountClient=ReturnType<typeof accountClient>
