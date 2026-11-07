// Administrator account deletion, using the same database task as self-service
// deletion (Account → Delete account), plus revoking invitations for people who
// never signed in. Nothing is hard-deleted from the database.
// Dry run:  DELETE_ACCOUNT_EMAIL=a@b.c node --import=tsx scripts/delete-account.ts --apply-dev|--apply-prod
// Delete:   add DELETE_ACCOUNT_CONFIRM=yes
import { aws, guardDevApply, invoke } from './dev-aws'
import { readMetadata } from './deploy-dev-api'
import { approvedProductionEmail, guardProductionApply, productionMetadata } from './prod-aws'
import { emailPattern } from '../src/types/patterns'

type CognitoUser = { Username: string; UserStatus: string; Attributes: { Name: string; Value: string }[] }

async function main() {
  const env = process.argv.slice(2).join(' ') === '--apply-prod' ? 'prod' : 'dev'
  if (env === 'prod') await guardProductionApply(); else await guardDevApply()
  const email = (process.env.DELETE_ACCOUNT_EMAIL ?? '').trim().toLowerCase(), apply = process.env.DELETE_ACCOUNT_CONFIRM === 'yes'
  if (!emailPattern.test(email)) throw new Error('DELETE_ACCOUNT_EMAIL required')
  if (email === approvedProductionEmail) throw new Error('Refusing to delete the approved owner account')
  const pool = env === 'prod' ? (await productionMetadata()).auth.UserPoolId : (await readMetadata()).auth.UserPoolId
  const store = `studiostack-${env}-database`
  const find = async () => (await aws<{ Users: CognitoUser[] }>('cognito-idp', 'list-users', ['--user-pool-id', pool, '--filter', `email = "${email}"`])).Users
  const users = await find()
  if (users.length > 1) throw new Error('Multiple Cognito users match this email')
  const user = users[0], subject = user?.Attributes.find(a => a.Name === 'sub')?.Value
  if (user && !subject) throw new Error('Cognito user has no subject')
  const invitations = await invoke<{ pending: number; revoked: number }>(store, { task: 'account-invitation-queue', action: 'revoke-email', email, apply: false })
  console.log(`${env}: ${user ? `${user.UserStatus} Cognito login` : 'no Cognito login'}, ${invitations.pending} pending invitation(s)`)
  if (!apply) { console.log('Dry run only; set DELETE_ACCOUNT_CONFIRM=yes to delete'); return }
  if (subject) {
    // Suspends memberships, withdraws access requests and clears email and name (see directory.ts).
    const result = await invoke<{ deleted?: true; statusCode?: number; error?: string }>(store, { task: 'account-directory', action: 'delete-account', identity: { issuer: `https://cognito-idp.us-east-2.amazonaws.com/${pool}`, subject, email: '' } })
    if (!result.deleted) throw new Error(result.error ?? 'Account deletion failed')
    console.log('Database account deleted')
  }
  const revoked = await invoke<{ revoked: number }>(store, { task: 'account-invitation-queue', action: 'revoke-email', email, apply: true })
  console.log(`${revoked.revoked} invitation(s) revoked`)
  if (!user) return
  await aws('cognito-idp', 'admin-delete-user', ['--user-pool-id', pool, '--username', user.Username])
  if ((await find()).length) throw new Error('Cognito login still present')
  console.log('Cognito login deleted')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Account deletion failed'); process.exitCode = 1 })
