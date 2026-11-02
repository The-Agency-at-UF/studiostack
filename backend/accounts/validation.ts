import { ApiError,object,text,uuid } from '../database/api-validation'
import type { ChangeMember,ChangeOrganization,InviteMember,VersionedRequest } from '../../src/types/accounts'
import { emailPattern } from '../../src/types/patterns'
export function versioned(value:Record<string,unknown>):VersionedRequest {
  if(!Number.isSafeInteger(value.version)||Number(value.version)<1)throw new ApiError(400,'A positive record version is required')
  return {version:Number(value.version),requestId:uuid(value.requestId)}
}
export function inviteMember(input:unknown):InviteMember {
  const v=object(input,['email','displayName','role','requestId']),email=text(v.email,254).toLowerCase()
  if(!emailPattern.test(email)||!['member','admin'].includes(String(v.role)))throw new ApiError(400,'A valid email and member/admin role are required')
  return {email,displayName:text(v.displayName,120),role:v.role as InviteMember['role'],requestId:uuid(v.requestId)}
}
export function changeMember(input:unknown):ChangeMember {
  const v=object(input,['role','status','version','requestId'])
  if(!['owner','admin','member'].includes(String(v.role))||!['active','suspended'].includes(String(v.status)))throw new ApiError(400,'Invalid member role or status')
  return {...versioned(v),role:v.role as ChangeMember['role'],status:v.status as ChangeMember['status']}
}
export function changeOrganization(input:unknown):ChangeOrganization {
  const v=object(input,['name','reservationDays','version','requestId'])
  if(!Number.isInteger(v.reservationDays)||Number(v.reservationDays)<1||Number(v.reservationDays)>90)throw new ApiError(400,'Reservation length must be between 1 and 90 days')
  return {...versioned(v),name:text(v.name,120),reservationDays:Number(v.reservationDays)}
}
