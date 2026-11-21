import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { aws, guardDevApply, devDirectory, pause } from './dev-aws'
import { readMetadata, withMaintenance, invokeMaintenance } from './deploy-dev-api'
import { approvedProductionEmail } from './prod-aws'
import { selectedBuild } from './database-build'
import { environments } from '../infra/database/resources'
import { devCopyInstancePattern, type KeptAccount } from '../backend/database/dev-copy'

/**
 * Makes dev a masked copy of production. Dry run by default. With --apply-dev it:
 *  1. restores production to a temporary private instance placed in dev's
 *     database network (live production is only read by RDS, never connected to),
 *  2. replaces dev's schema and data with it in one dev transaction, masking
 *     supported email patterns and stopping unsent email,
 *  3. deletes the temporary instance,
 *  4. mirrors production's private photos into the dev bucket.
 */
const prodInstance = 'studiostack-prod-pg', devDatabaseGroup = environments.find(e => e.name === 'dev')!.databaseGroup
const photoPrefixes = ['photos/', 'briefs/']
interface Instance { DBInstanceIdentifier: string; DBInstanceStatus: string; StorageEncrypted: boolean; PubliclyAccessible: boolean; Endpoint?: { Address: string }
  DBSubnetGroup: { DBSubnetGroupName: string }; VpcSecurityGroups: { VpcSecurityGroupId: string }[]; MasterUserSecret?: { SecretArn: string; SecretStatus: string }; TagList?: { Key: string; Value: string }[] }
interface CopyResult { ok: boolean; migrations: number; tables: number; rows: number; counts: Record<string, number>; maskedRows: number; linked: number; stoppedDeliveries: number }
const describe = async (id: string) => (await aws<{ DBInstances: Instance[] }>('rds', 'describe-db-instances', ['--db-instance-identifier', id])).DBInstances[0]

/** Kept emails stay real; each is linked to the dev Cognito login with that email so its owner can sign in on localhost. */
async function keptAccounts(userPoolId: string): Promise<KeptAccount[]> {
  const emails = (process.env.DEV_COPY_KEEP_EMAILS ?? approvedProductionEmail).split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const kept: KeptAccount[] = []
  for (const email of emails) {
    if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) throw new Error('DEV_COPY_KEEP_EMAILS must be a comma-separated list of emails')
    const { Users } = await aws<{ Users: { Enabled: boolean; Attributes: { Name: string; Value: string }[] }[] }>('cognito-idp', 'list-users', ['--user-pool-id', userPoolId, '--filter', `email = "${email}"`])
    const verified = Users.filter(user => user.Enabled && user.Attributes.some(a => a.Name === 'email_verified' && a.Value === 'true'))
    const subject = verified.length === 1 ? verified[0].Attributes.find(a => a.Name === 'sub')?.Value : undefined
    if (!subject) throw new Error(`A kept email must have exactly one enabled, verified dev Cognito login: ${email}`)
    kept.push({ email, subject })
  }
  return kept
}

async function removeRestore(id: string, runId: string, prodSecretArn?: string) {
  const instance = await describe(id)
  // Deleting an instance deletes its managed secret; never risk production's.
  if (prodSecretArn && instance.MasterUserSecret?.SecretArn === prodSecretArn) throw new Error(`${id} references production's master secret; detach it before deleting the restore by hand`)
  if (!['ManagedBy=StudioStack', 'Temporary=true', `RunId=${runId}`].every(tag => instance.TagList?.some(t => `${t.Key}=${t.Value}` === tag))) throw new Error(`Restore ownership mismatch; delete ${id} by hand after checking it`)
  await aws('rds', 'delete-db-instance', ['--db-instance-identifier', id, '--skip-final-snapshot', '--delete-automated-backups'])
  for (let i = 0; ; i++) {
    const { DBInstances } = await aws<{ DBInstances: Instance[] }>('rds', 'describe-db-instances')
    if (!DBInstances.some(v => v.DBInstanceIdentifier === id)) break
    if (i >= 90) { console.log(`${id} is still deleting; check it is gone later`); return }
    await pause(20_000)
  }
  console.log(`Temporary restore ${id} deleted`)
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--apply-dev') {
    console.log('Dry run. With --apply-dev this restores production to a temporary private instance in dev\'s network, replaces dev\'s database with a copy of it')
    console.log(`It masks supported email patterns, stops unsent email, deletes the restore and mirrors the ${photoPrefixes.join(' and ')} prefixes into the dev bucket.`)
    console.log('Everything currently in the dev database is replaced. Nothing was changed.')
    return
  }
  await guardDevApply()
  await selectedBuild('dev')
  const metadata = await readMetadata(), keep = await keptAccounts(metadata.auth.UserPoolId)
  const prod = await describe(prodInstance)
  if (prod.DBInstanceStatus !== 'available' || !prod.StorageEncrypted) throw new Error('Unexpected production instance')
  const { DBInstances } = await aws<{ DBInstances: Instance[] }>('rds', 'describe-db-instances')
  const leftover = DBInstances.filter(v => devCopyInstancePattern.test(v.DBInstanceIdentifier)).map(v => v.DBInstanceIdentifier)
  if (leftover.length) throw new Error(`An earlier copy is still present; inspect and delete it first: ${leftover.join(', ')}`)

  const started = new Date().toISOString(), stamp = started.replace(/[^0-9]/g, '').slice(0, 14)
  const id = `studiostack-prod-pg-devcopy-${stamp}`, runId = `${stamp.slice(0, 8)}-${randomBytes(4).toString('hex')}`
  const evidence: Record<string, unknown> = { started, source: prodInstance, restore: id, keptAccounts: keep.length }
  let created = false, copied = false
  try {
    await aws('rds', 'restore-db-instance-to-point-in-time', ['--source-db-instance-identifier', prodInstance, '--target-db-instance-identifier', id, '--use-latest-restorable-time',
      '--db-instance-class', 'db.t4g.micro', '--no-multi-az', '--no-publicly-accessible', '--db-subnet-group-name', prod.DBSubnetGroup.DBSubnetGroupName,
      '--vpc-security-group-ids', devDatabaseGroup, '--no-deletion-protection',
      '--tags', 'Key=ManagedBy,Value=StudioStack', 'Key=Temporary,Value=true', `Key=RunId,Value=${runId}`, 'Key=Purpose,Value=dev-copy'])
    created = true
    console.log(`Restoring production's latest restorable point to ${id} (usually 10-20 minutes)`)
    let restore = await describe(id)
    for (let i = 0; restore.DBInstanceStatus !== 'available'; i++) {
      if (i >= 135) throw new Error('Restore did not become available within 45 minutes')
      await pause(20_000); restore = await describe(id)
    }
    // Point-in-time restores can't take a managed password, so give the restore its own RDS-managed secret now.
    // Dev maintenance must never be handed production's master secret.
    if (restore.MasterUserSecret && restore.MasterUserSecret.SecretArn === prod.MasterUserSecret?.SecretArn) throw new Error('Restore still points at production\'s master secret')
    if (!restore.MasterUserSecret) {
      await aws('rds', 'modify-db-instance', ['--db-instance-identifier', id, '--manage-master-user-password', '--apply-immediately'])
      await pause(30_000); restore = await describe(id)
    }
    for (let i = 0; restore.DBInstanceStatus !== 'available' || restore.MasterUserSecret?.SecretStatus !== 'active'; i++) {
      if (i >= 45) throw new Error('Restore secret was not ready within 15 minutes')
      await pause(20_000); restore = await describe(id)
    }
    if (!restore.MasterUserSecret || restore.MasterUserSecret.SecretArn === prod.MasterUserSecret?.SecretArn) throw new Error('Restore needs its own master secret')
    if (restore.PubliclyAccessible || !restore.StorageEncrypted || restore.VpcSecurityGroups.length !== 1 || restore.VpcSecurityGroups[0].VpcSecurityGroupId !== devDatabaseGroup || !restore.Endpoint || !restore.MasterUserSecret) throw new Error('Restore is not private to dev\'s database network')
    const copySource = { host: restore.Endpoint.Address, secretArn: restore.MasterUserSecret.SecretArn }
    const result = await withMaintenance(metadata, runId, () => invokeMaintenance<CopyResult>({ action: 'dev-copy', keep }, 900), { timeout: 900, copySource })
    if (!result.ok) throw new Error('Dev copy did not complete; dev database unchanged')
    copied = true
    const { ok: _ok, ...summary } = result; void _ok
    evidence.copy = summary
    console.log(`Dev database replaced: ${result.rows} rows in ${result.tables} tables at ${result.migrations} production migrations; ${result.maskedRows} rows had emails masked, ${result.linked} sign-ins linked, ${result.stoppedDeliveries} unsent emails stopped`)
  } finally {
    if (created) await removeRestore(id, runId, prod.MasterUserSecret?.SecretArn)
    evidence.completed = new Date().toISOString(); evidence.copied = copied
    await writeFile(`${devDirectory}/prod-copy.json`, JSON.stringify(evidence, null, 2))
  }
  for (const prefix of photoPrefixes) await aws('s3', 'sync', [`s3://studio-stack-photos-prod/${prefix}`, `s3://studio-stack-photos-dev/${prefix}`, '--delete', '--sse', 'AES256', '--only-show-errors'])
  console.log('Production photos mirrored into the dev bucket')
  console.log('Dev now runs production\'s schema. If the dev API runtime is from a newer commit than production, redeploy it from production\'s commit.')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Production copy to dev failed'); process.exitCode = 1 })
