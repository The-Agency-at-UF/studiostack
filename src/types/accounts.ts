import type { ApiMember, ApiOrganization, ApiGroup } from './database-api'
export interface OrganizationSettings { id:string; name:string; slug:string; reservationDays:number; version:number; role:ApiOrganization['role'] }
export interface ManagedMember extends ApiMember { version:number }
export interface ManagedTeam extends ApiGroup { version:number; archivedAt:string|null; memberIds:string[] }
export interface OrganizationInvitation { id:string; email:string; displayName:string; role:'admin'|'member'; status:'pending'|'accepted'|'revoked'|'expired'; deliveryStatus:'queued'|'sending'|'sent'|'failed'|'uncertain'; attempts:number; expiresAt:string; version:number; createdAt:string }
export interface PendingInvitation { id:string; organizationId:string; organizationName:string; role:'admin'|'member'; expiresAt:string }
export interface OrganizationActivity { id:string; actorName:string; kind:string; targetId:string|null; details:Record<string,unknown>; createdAt:string }
export interface VersionedRequest { version:number; requestId:string }
export interface InviteMember { email:string; displayName:string; role:'admin'|'member'; requestId:string }
export interface ChangeMember extends VersionedRequest { role:ApiOrganization['role']; status:ApiMember['status'] }
export interface ChangeTeam extends VersionedRequest { name:string; archived:boolean; memberIds:string[] }
export interface ChangeOrganization extends VersionedRequest { name:string; reservationDays:number }
