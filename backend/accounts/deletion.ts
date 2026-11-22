import { inTransaction, type DatabaseClient } from '../database/client'
import { object, uuid } from '../database/api-validation'

interface DeletionIdentity { issuer:string; subject:string }
interface DeletionJob extends DeletionIdentity { username:string }
export type DeletionRequest = {action:'claim'} | ({action:'complete'} & DeletionIdentity)

export function deletionRequest(input:unknown,pool:string):DeletionRequest {
  const v=object(input,['action','issuer','subject'])
  if(v.action==='claim'){object(input,['action']);return {action:'claim'}}
  if(v.action!=='complete'||v.issuer!==`https://cognito-idp.us-east-2.amazonaws.com/${pool}`)throw new Error('Invalid account deletion operation')
  return {action:'complete',issuer:String(v.issuer),subject:uuid(v.subject)}
}

export async function deletionTask(client:DatabaseClient,request:DeletionRequest) {
  if(request.action==='complete'){
    const result=await client.query(`UPDATE app.users SET deletion_completed_at=COALESCE(deletion_completed_at,now()),deletion_username=NULL,deletion_retry_at=NULL
      WHERE cognito_issuer=$1 AND cognito_subject=$2 AND deletion_requested_at IS NOT NULL RETURNING id`,[request.issuer,request.subject])
    return {completed:result.rows.length===1}
  }
  return inTransaction(client,async()=>{
    const {rows:jobs}=await client.query<DeletionJob>(`WITH due AS (
      SELECT id FROM app.users WHERE deletion_completed_at IS NULL AND deletion_retry_at<=now()
      ORDER BY deletion_retry_at,id LIMIT 5 FOR UPDATE SKIP LOCKED
    )
    UPDATE app.users u SET deletion_retry_at=now()+interval '5 minutes' FROM due WHERE u.id=due.id
    RETURNING u.cognito_issuer AS issuer,u.cognito_subject AS subject,u.deletion_username AS username`)
    return {jobs}
  })
}

interface DeletionProvider {
  get(username:string):Promise<{subject?:string}>
  remove(subject:string):Promise<void>
}

const absent=(error:unknown)=>error instanceof Error&&error.name==='UserNotFoundException'

/** Use the immutable subject for destructive provider calls. The stored username only confirms absence. */
export async function reconcileDeletion(job:DeletionJob,issuer:string,provider:DeletionProvider) {
  if(job.issuer!==issuer)throw new Error('Unexpected deletion identity issuer')
  try {
    if((await provider.get(job.subject)).subject!==job.subject)throw new Error('Deletion subject did not verify')
  } catch(error) {
    if(!absent(error))throw error
    try {
      const user=await provider.get(job.username)
      if(!user.subject||user.subject===job.subject)throw new Error('Provider does not support deletion by immutable subject for this identity')
    } catch(lookupError) {
      if(!absent(lookupError))throw lookupError
    }
    return
  }
  try { await provider.remove(job.subject) }
  catch(error) { if(!absent(error))throw error }
}
