import { readFile, writeFile } from 'node:fs/promises'
import { guardDevApply, aws, devDirectory } from './dev-aws'
import { readMetadata, withMaintenance, invokeMaintenance } from './deploy-dev-api'

async function main() {
  await guardDevApply()
  const file = `${devDirectory}/verification-pending.json`
  const evidence = JSON.parse(await readFile(file, 'utf8'))
  if (evidence.cleanedAt) { console.log('Prior failed-run fixtures already removed'); return }
  if (!/^\d{8}-[a-f0-9]{8}$/.test(evidence.runId)) throw new Error('Unexpected fixture run')
  if (evidence.seeded) await withMaintenance(await readMetadata(), evidence.runId, async () => {
    const result = await invokeMaintenance<{ ok: boolean }>({ ...evidence.fixture, action: 'cleanup' })
    if (!result.ok) throw new Error('Cleanup verification failed')
  })
  for (const key of evidence.keys as string[]) {
    if (!key.startsWith(`staging/${evidence.fixture.organizationId}/`) && !key.startsWith(`photos/${evidence.fixture.organizationId}/`)) throw new Error('Unexpected test photo target')
    await aws('s3api', 'delete-object', ['--bucket', 'studio-stack-photos-dev', '--key', key])
  }
  evidence.cleanedAt = new Date().toISOString()
  await writeFile(file, JSON.stringify(evidence, null, 2))
  console.log('Only prior failed-run synthetic database records/test photos removed; original databases retained')
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Fixture cleanup failed'); process.exitCode = 1 })
