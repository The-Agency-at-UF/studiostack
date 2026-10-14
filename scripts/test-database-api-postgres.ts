import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { resolve } from 'node:path'

/** Fresh localhost-only disposable container; never uses any AWS settings. */
const execute = promisify(execFile)
async function stopTestContainer(name: string) {
  const { stdout } = await execute('docker', ['inspect', name, '--format', '{{index .Config.Labels "studiostack.disposable-api-test"}}'])
  if (stdout.trim() !== 'true') throw new Error('Refusing to stop an unrelated container')
  await execute('docker', ['stop', name]) // --rm discards only this newly created test container/data.
  console.log('Disposable local PostgreSQL test container removed; AWS unchanged')
}
async function main() {
  const name = `studiostack-api-test-${randomUUID()}`
  let created = false
  try {
    await execute('docker', ['run', '--detach', '--rm', '--name', name, '--label', 'studiostack.disposable-api-test=true', '--memory', '256m', '--cpus', '1', '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data:rw', '--env', 'POSTGRES_PASSWORD=studiostack-test-only', '--env', 'POSTGRES_DB=studiostack_api_test', 'postgres:17-alpine'])
    created = true
    let ready = false
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await execute('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'studiostack_api_test']); ready = true; break }
      catch { await new Promise(resolvePause => setTimeout(resolvePause, 1000)) }
    }
    if (!ready) throw new Error('Disposable test PostgreSQL was not ready')
    const { stdout } = await execute('docker', ['inspect', name, '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}'])
    const port = stdout.trim()
    if (!/^\d+$/.test(port)) throw new Error('Unexpected test database port')
    const result = await execute(resolve('node_modules/.bin/vitest'), ['run', 'src/api/database.postgres.test.ts'], {
      env: { ...process.env, DATABASE_API_TEST_URL: `postgresql://postgres:studiostack-test-only@127.0.0.1:${port}/studiostack_api_test` }, maxBuffer: 1024 * 1024,
    })
    console.log(result.stdout)
  } finally {
    if (created) {
      await stopTestContainer(name)
    }
  }
}
main().catch(error => {
  // Test output contains only synthetic fixture data, never AWS credentials.
  if (error && typeof error === 'object' && 'stdout' in error) console.error(String(error.stdout))
  if (error && typeof error === 'object' && 'stderr' in error) console.error(String(error.stderr))
  console.error('PostgreSQL API tests failed; check test output and local Docker availability')
  process.exitCode = 1
})
