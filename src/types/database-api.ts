/** HTTP API contracts. These are deliberately separate from preview-store timestamps. */
export const equipmentCategories = ['Camera & Accessories', 'Lights', 'Production Design', 'Audio', 'Cables & Cords', 'Miscellaneous', 'Tripods / Stands', 'Props', 'SD Cards'] as const
export type EquipmentCategory = typeof equipmentCategories[number]
export const equipmentColors = ['red','orange','yellow','green','blue','purple','black','white'] as const
export type EquipmentColor = typeof equipmentColors[number]
export const equipmentStatusLabel = (status: EquipmentStatus) => status === 'retired' ? 'Archived' : status === 'maintenance' ? 'Maintenance' : 'Available'
export type EquipmentStatus = 'available' | 'maintenance' | 'retired'
export interface ApiUser { id: string; email: string | null; displayName: string | null; onboardedAt: string | null }
export interface ApiOrganization { id: string; slug: string; name: string; role: 'owner' | 'admin' | 'member'; /** Hour-long private link to the workspace logo, or null when it has none. */ logoUrl?: string | null }
export interface ApiMember extends Omit<ApiUser, 'onboardedAt'> { role: ApiOrganization['role']; status: 'invited' | 'active' | 'suspended' }
export interface ApiEquipment { colorTag?:EquipmentColor|null; id: string; equipmentCode: string; name: string; category: EquipmentCategory; status: EquipmentStatus; createdAt: string; photoId: string | null }
export interface ApiReservation { readOnly?: boolean; clientAccountId?:string|null; id: string; userId: string; name: string; startsAt: string; endsAt: string; status: 'confirmed' | 'cancelled'; equipmentIds: string[]; createdAt: string }
export type FeedbackKind = 'bug' | 'feature'
export interface ApiBugReport {id:string;title:string;description:string;pagePath:string;createdAt:string}
export interface ApiPage<T> { items: T[]; nextCursor: string | null }
export interface CreateEquipment { colorTag?: EquipmentColor | null; equipmentCode: string; name: string; category: EquipmentCategory; photoId?: string }
export interface UpdateEquipment { colorTag?: EquipmentColor | null; name?: string; category?: EquipmentCategory; status?: EquipmentStatus; photoId?: string | null }
export interface CreateReservation { clientAccountId?:string|null; name: string; startsAt: string; endsAt: string; equipmentIds: string[]; requestId: string }
export interface CreatePhotoUpload { organizationId: string; contentType: 'image/jpeg' | 'image/webp'; size: number; requestId: string }
export interface ApiPhotoUpload { photoId: string; url: string; fields: Record<string, string> }
export interface ApiCompletedPhoto { photoId: string; width: number; height: number; size: number }
export interface ApiPhotoDownload { photoId: string; url: string; expiresIn: number }
