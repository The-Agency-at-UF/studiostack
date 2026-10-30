/** HTTP API contracts. These are deliberately separate from preview-store timestamps. */
export const equipmentCategories = ['Camera & Accessories', 'Lights', 'Production Design', 'Audio', 'Cables & Cords', 'Miscellaneous'] as const
export type EquipmentCategory = typeof equipmentCategories[number]
export type EquipmentStatus = 'available' | 'maintenance' | 'retired'
export interface ApiUser { id: string; email: string | null; displayName: string | null }
export interface ApiOrganization { id: string; slug: string; name: string; role: 'owner' | 'admin' | 'member' }
export interface ApiMember extends ApiUser { role: ApiOrganization['role']; status: 'invited' | 'active' | 'suspended' }
export interface ApiGroup { id: string; name: string }
export interface ApiEquipment { id: string; equipmentCode: string; name: string; category: EquipmentCategory; status: EquipmentStatus; createdAt: string; photoId: string | null }
export interface ApiReservation { readOnly?: boolean; id: string; userId: string; name: string; startsAt: string; endsAt: string; status: 'confirmed' | 'cancelled'; equipmentIds: string[]; createdAt: string }
export interface ApiPage<T> { items: T[]; nextCursor: string | null }
export interface CreateEquipment { equipmentCode: string; name: string; category: EquipmentCategory; photoId?: string }
export interface UpdateEquipment { name?: string; category?: EquipmentCategory; status?: EquipmentStatus; photoId?: string | null }
export interface CreateReservation { name: string; startsAt: string; endsAt: string; equipmentIds: string[]; requestId: string }
export interface CreatePhotoUpload { organizationId: string; contentType: 'image/jpeg' | 'image/webp'; size: number; requestId: string }
export interface ApiPhotoUpload { photoId: string; url: string; fields: Record<string, string> }
export interface ApiCompletedPhoto { photoId: string; width: number; height: number; size: number }
export interface ApiPhotoDownload { photoId: string; url: string; expiresIn: number }
