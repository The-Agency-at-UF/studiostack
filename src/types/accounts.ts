import type { ApiMember, ApiOrganization } from './database-api'
export interface OrganizationSettings { id:string; name:string; slug:string; reservationDays:number; location:string|null; logoPhotoId:string|null; version:number; role:ApiOrganization['role'] }
export interface DirectoryMember { id:string; displayName:string; role:ApiOrganization['role'] }
export interface ManagedMember extends ApiMember { version:number; self?:boolean }
export interface OrganizationInvitation { id:string; email:string; displayName:string; role:'admin'|'member'; status:'pending'|'accepted'|'revoked'|'expired'; deliveryStatus:'queued'|'sending'|'sent'|'failed'|'uncertain'; attempts:number; expiresAt:string; version:number; createdAt:string }
export interface PendingInvitation { id:string; organizationId:string; organizationName:string; role:'admin'|'member'; displayName?:string; expiresAt:string }
interface DomainMatch { organizationId:string; organizationName:string; autoJoin:boolean }
export interface OwnAccessRequest { id:string; organizationId:string; organizationName:string; status:'pending'|'denied'|'withdrawn'; createdAt:string; decidedAt:string|null }
/** How the signed-in account can reach an organization found by search. */
export type JoinPolicy = 'member' | 'open' | 'request' | 'pending' | 'invite'
export interface OrganizationSearchResult { organizationId:string; name:string; location:string|null; policy:JoinPolicy }
export interface OnboardingOverview { email:string; displayName:string|null; invitations:PendingInvitation[]; domainMatches:DomainMatch[]; requests:OwnAccessRequest[] }
export interface OrganizationActivity { id:string; actorName:string; kind:string; targetId:string|null; details:Record<string,unknown>; createdAt:string }
export interface VersionedRequest { version:number; requestId:string }
export interface InviteMember { email:string; displayName?:string; role:'admin'|'member'; requestId:string }
export interface ChangeMember extends VersionedRequest { role:ApiOrganization['role']; status:ApiMember['status'] }
/** `location`: empty clears it. `logoPhotoId`: a completed photo id sets the logo, null removes it. Either omitted keeps the current value. */
export interface ChangeOrganization extends VersionedRequest { name:string; reservationDays:number; location?:string|null; logoPhotoId?:string|null }
export interface WorkspaceDomain { domain:string; autoJoin:boolean; version:number; createdAt:string }
export interface JoinCode { id:string; label:string; maxUses:number|null; uses:number; expiresAt:string|null; revokedAt:string|null; version:number; createdAt:string; /** Also returned on admin reads for a reusable organization code. */ code?:string }
export interface CreateJoinCode { label:string; reusable?:boolean; replaces?:string; maxUses?:number|null; expiresInDays?:number|null; requestId:string }
export interface PendingAccessRequest { id:string; userId:string; email:string; displayName:string|null; message:string|null; status:'pending'|'approved'|'denied'|'withdrawn'; version:number; createdAt:string; decidedAt:string|null }
