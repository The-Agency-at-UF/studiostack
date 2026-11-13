import type {ClientAccount} from '../../types/production'
// The server enforces the same rule: owners, administrators and the person who added the account.
export const clientDeletable=(c:ClientAccount,userId:string|undefined,canAdminister:boolean)=>canAdminister||Boolean(userId)&&c.createdBy===userId
