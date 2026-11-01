import type { ApiMember, ApiOrganization, ApiGroup } from './database-api'
export interface OrganizationSettings { id:string; name:string; slug:string; reservationDays:number; version:number; role:ApiOrganization['role'] }
export interface DirectoryMember { id:string; displayName:string; role:ApiOrganization['role'] }
export interface ManagedMember extends ApiMember { version:number }
export interface ManagedTeam extends ApiGroup { version:number; archivedAt:string|null; memberIds:string[] }
export interface OrganizationInvitation { id:string; email:string; displayName:string; role:'admin'|'member'; status:'pending'|'accepted'|'revoked'|'expired'; deliveryStatus:'queued'|'sending'|'sent'|'failed'|'uncertain'; attempts:number; expiresAt:string; version:number; createdAt:string }
export interface PendingInvitation { id:string; organizationId:string; organizationName:string; role:'admin'|'member'; displayName?:string; expiresAt:string }
export interface DomainMatch { organizationId:string; organizationName:string; autoJoin:boolean }
export interface OwnAccessRequest { id:string; organizationId:string; organizationName:string; status:'pending'|'denied'|'withdrawn'; createdAt:string; decidedAt:string|null }
export interface OnboardingOverview { email:string; displayName:string|null; invitations:PendingInvitation[]; domainMatches:DomainMatch[]; requests:OwnAccessRequest[] }
export interface OrganizationActivity { id:string; actorName:string; kind:string; targetId:string|null; details:Record<string,unknown>; createdAt:string }
export interface VersionedRequest { version:number; requestId:string }
export interface InviteMember { email:string; displayName:string; role:'admin'|'member'; requestId:string }
export interface ChangeMember extends VersionedRequest { role:ApiOrganization['role']; status:ApiMember['status'] }
export interface ChangeTeam extends VersionedRequest { name:string; archived:boolean; memberIds:string[] }
export interface ChangeOrganization extends VersionedRequest { name:string; reservationDays:number }
export interface WorkspaceDomain { domain:string; autoJoin:boolean; version:number; createdAt:string }
export interface JoinCode { id:string; label:string; maxUses:number|null; uses:number; expiresAt:string|null; revokedAt:string|null; version:number; createdAt:string; /** Present only in the create response. */ code?:string }
export interface CreateJoinCode { label:string; maxUses?:number|null; expiresInDays?:number|null; requestId:string }
export interface PendingAccessRequest { id:string; userId:string; email:string; displayName:string|null; message:string|null; status:'pending'|'approved'|'denied'|'withdrawn'; version:number; createdAt:string; decidedAt:string|null }
