import { readFile, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { guardDevApply, aws, devDirectory, invoke, pause } from './dev-aws'
import { readMetadata, withMaintenance, invokeMaintenance } from './deploy-dev-api'

type Cluster = { DBClusterIdentifier: string; DBClusterArn: string; Status: string; Endpoint: string; DBSubnetGroup: string; StorageEncrypted: boolean; BackupRetentionPeriod: number; LatestRestorableTime: string; DBClusterMembers: { DBInstanceIdentifier: string }[]; VpcSecurityGroups: { VpcSecurityGroupId: string }[] }
async function getCluster(id: string) { return (await aws<{ DBClusters: Cluster[] }>('rds', 'describe-db-clusters', ['--db-cluster-identifier', id])).DBClusters[0] }
async function removeRestore(id: string, writer: string, runId: string) {
  const restored = await getCluster(id)
  const { TagList } = await aws<{ TagList: { Key: string; Value: string }[] }>('rds', 'list-tags-for-resource', ['--resource-name', restored.DBClusterArn])
  if (!['ManagedBy=StudioStack', 'Temporary=true', `RunId=${runId}`, 'Source=studiostack-dev-db'].every(expected => TagList.some(t => `${t.Key}=${t.Value}` === expected))) throw new Error(`Restore ownership mismatch; manual cleanup required: ${id}`)
  const all = await aws<{ DBInstances: { DBInstanceIdentifier: string; DBClusterIdentifier?: string }[] }>('rds', 'describe-db-instances')
  for (const instance of all.DBInstances.filter(v => v.DBClusterIdentifier === id)) {
    if (instance.DBInstanceIdentifier !== writer) throw new Error('Unexpected restore instance; manual inspection required')
    await aws('rds', 'delete-db-instance', ['--db-instance-identifier', writer, '--skip-final-snapshot'])
  }
  for (let i = 0; i < 120; i++) {
    const instances = await aws<{ DBInstances: { DBInstanceIdentifier: string }[] }>('rds', 'describe-db-instances')
    if (!instances.DBInstances.some(v => v.DBInstanceIdentifier === writer)) break
    if (i === 119) throw new Error(`Restore writer deletion pending: ${writer}`)
    await pause(10_000)
  }
  await aws('rds', 'delete-db-cluster', ['--db-cluster-identifier', id, '--skip-final-snapshot'])
  for (let i = 0; i < 120; i++) {
    const clusters = await aws<{ DBClusters: Cluster[] }>('rds', 'describe-db-clusters')
    if (!clusters.DBClusters.some(v => v.DBClusterIdentifier === id)) break
    if (i === 119) throw new Error(`Restore cluster deletion pending: ${id}`)
    await pause(10_000)
  }
  console.log('Temporary restore writer/cluster removed; original dev/prod backups preserved')
}
async function main() {
  await guardDevApply()
  const metadata = await readMetadata()
  const evidence = JSON.parse(await readFile(`${devDirectory}/verification.json`, 'utf8'))
  const { runId, fixture, digest, checkpoint } = evidence
  if (!/^\d{8}-[a-f0-9]{8}$/.test(runId) || !digest?.ok || !digest.tls || Date.parse(checkpoint) < Date.now() - 24 * 3600_000) throw new Error('Fresh verified dev fixture required')
  const id = `studiostack-dev-restore-${runId}`, writer = `${id}-writer`
  let created = false, verified = false, createdAt: string | undefined
  try {
    const existing = await aws<{ DBClusters: Cluster[] }>('rds', 'describe-db-clusters')
    if (existing.DBClusters.some(c => c.DBClusterIdentifier === id)) throw new Error('Restore target already exists; inspect it instead of overwriting')
    let source = await getCluster('studiostack-dev-db')
    if (!source.StorageEncrypted || source.BackupRetentionPeriod !== 7 || source.VpcSecurityGroups[0]?.VpcSecurityGroupId !== 'sg-00b357564909ca20b') throw new Error('Unexpected source backup/network config')
    console.log('Waiting for automated backup window to include the verified fixture checkpoint')
    for (let i = 0; Date.parse(source.LatestRestorableTime) < Date.parse(checkpoint); i++) {
      if (i === 60) throw new Error('Backup checkpoint not available after 15 minutes; no restore billed')
      if (i % 4 === 0) await invoke('studiostack-dev-database', {}) // Brief read-only wake; closes connection.
      await pause(15_000)
      source = await getCluster('studiostack-dev-db')
    }
    const tags = [{ Key: 'ManagedBy', Value: 'StudioStack' }, { Key: 'Temporary', Value: 'true' }, { Key: 'RunId', Value: runId }, { Key: 'Source', Value: 'studiostack-dev-db' }]
    // A fresh private restore, never replace/reconfigure the source or production.
    // Aurora public accessibility belongs to the writer instance below; the
    // cluster-level PubliclyAccessible option is only for non-Aurora Multi-AZ.
    await aws('rds', 'restore-db-cluster-to-point-in-time', ['--db-cluster-identifier', id, '--source-db-cluster-identifier', 'studiostack-dev-db', '--restore-to-time', checkpoint, '--engine-mode', 'provisioned', '--db-subnet-group-name', source.DBSubnetGroup, '--vpc-security-group-ids', 'sg-00b357564909ca20b', '--no-deletion-protection', '--network-type', 'IPV4', '--serverless-v2-scaling-configuration', JSON.stringify({ MinCapacity: 0, MaxCapacity: 1, SecondsUntilAutoPause: 300 }), '--tags', JSON.stringify(tags)])
    created = true; createdAt = new Date().toISOString()
    console.log(`Temporary private restore requested: ${id}`)
    for (let i = 0; (await getCluster(id)).Status !== 'available'; i++) {
      if (i === 59) throw new Error('Restore cluster creation exceeded 15 minutes; cleaning up')
      await pause(15_000)
    }
    // CLI restores a cluster only. Add exactly one serverless writer, no reader.
    await aws('rds', 'create-db-instance', ['--db-instance-identifier', writer, '--db-cluster-identifier', id, '--engine', 'aurora-postgresql', '--db-instance-class', 'db.serverless', '--no-publicly-accessible', '--tags', JSON.stringify(tags)])
    let restored: Cluster | undefined
    for (let i = 0; i < 120; i++) {
      restored = await getCluster(id)
      const instances = await aws<{ DBInstances: { DBInstanceStatus: string; PubliclyAccessible: boolean }[] }>('rds', 'describe-db-instances', ['--db-instance-identifier', writer])
      if (restored.Status === 'available' && restored.StorageEncrypted && instances.DBInstances[0].DBInstanceStatus === 'available' && !instances.DBInstances[0].PubliclyAccessible) break
      if (i === 119) throw new Error('Restore exceeded 30-minute test limit; cleaning up to protect budget')
      await pause(15_000)
    }
    await withMaintenance(metadata, runId, async () => {
      const actual = await invokeMaintenance<Record<string, unknown>>({ ...fixture, action: 'digest', restoreHost: restored!.Endpoint })
      if (!actual.ok || !actual.tls || !isDeepStrictEqual(digest.counts, actual.counts) || !isDeepStrictEqual(digest.hashes, actual.hashes) || !isDeepStrictEqual(digest.columns, actual.columns)) throw new Error('Restored schema/data digest differs')
      for (const key of evidence.keys as string[]) if (key.startsWith(`photos/${fixture.organizationId}/`)) {
        const object = await aws<{ ContentLength: number; ContentType: string; ServerSideEncryption: string }>('s3api', 'head-object', ['--bucket', 'studio-stack-photos-dev', '--key', key])
        if (!object.ContentLength || object.ContentType !== 'image/jpeg' || object.ServerSideEncryption !== 'AES256') throw new Error('Referenced private photo is unavailable')
      }
      verified = true
      console.log('Restore verified: TLS, application schema, organization/inventory/reservation/photo record hashes match')
    })
  } finally {
    if (created) {
      await removeRestore(id, writer, runId)
    }
    await writeFile(`${devDirectory}/restore-verification.json`, JSON.stringify({ runId, source: 'studiostack-dev-db', checkpoint, target: id, createdAt, completedAt: new Date().toISOString(), verified, temporaryDatabaseRemoved: created, budgetApprovedUsd: 5, actualBillingPending: true }, null, 2))
  }
  if (!verified) throw new Error('Restore test incomplete')
  await withMaintenance(metadata, runId, async () => {
    const cleaned = await invokeMaintenance<{ ok: boolean }>({ ...fixture, action: 'cleanup' })
    if (!cleaned.ok) throw new Error('Synthetic database fixture cleanup failed')
  })
  for (const key of evidence.keys as string[]) {
    if (!key.startsWith(`staging/${fixture.organizationId}/`) && !key.startsWith(`photos/${fixture.organizationId}/`)) throw new Error('Unexpected test photo key')
    await aws('s3api', 'delete-object', ['--bucket', 'studio-stack-photos-dev', '--key', key])
  }
  evidence.fixtureCleanupPending = false
  await writeFile(`${devDirectory}/verification.json`, JSON.stringify(evidence, null, 2))
  console.log('Synthetic source records and test photos removed after restore verification')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Dev restore verification failed'); process.exitCode = 1 })
