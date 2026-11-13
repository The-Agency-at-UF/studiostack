import { inTransaction, type DatabaseClient } from './client'
import { object } from './api-validation'

interface RetentionResult { photoUploads: number; joinCodeAttempts: number; readAlerts: number }
/** IAM-only scheduled task. The database function fixes what is deleted and after how long. */
export async function retentionTask(client: DatabaseClient, input: unknown): Promise<RetentionResult> {
  object(input, [])
  return inTransaction(client, async () => (await client.query<RetentionResult & Record<string, number>>(
    'SELECT deleted_photo_uploads AS "photoUploads", deleted_join_code_attempts AS "joinCodeAttempts", deleted_read_alerts AS "readAlerts" FROM app.purge_expired_rows()')).rows[0])
}
