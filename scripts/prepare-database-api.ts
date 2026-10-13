import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { databaseApiInfrastructure } from '../infra/database/api-resources'
import { databaseApiGrants } from '../backend/database/api-grants'

// Local build only: no AWS CLI, credentials, database connection or deployment.
const execute = promisify(execFile)
async function main() {
  const directory = resolve('.aws/database-api')
  await mkdir(directory, { recursive: true })
  const archiveDirectory = await mkdtemp(`${directory}/archives-`)
  for (const [name, source] of [['runtime', 'api-entry'], ['setup', 'api-setup']]) {
    const output = await mkdtemp(`${directory}/${name}-`)
    await mkdir(`${output}/certs`, { recursive: true })
    // Public certificate downloaded separately, never a credentials file.
    const ca = await readFile(resolve('.aws/database-lambda/certs/us-east-2-bundle.pem'))
    if (!ca.toString().includes('-----BEGIN CERTIFICATE-----')) throw new Error('Download the public regional RDS CA certificate first')
    await writeFile(`${output}/certs/us-east-2-bundle.pem`, ca)
    await writeFile(`${output}/package.json`, JSON.stringify({ type: 'commonjs' }))
    await execute(resolve('node_modules/.bin/esbuild'), [`backend/database/${source}.ts`, '--bundle', '--platform=node', '--target=node24', '--format=cjs', '--external:pg-native', `--outfile=${output}/index.js`])
    if (name === 'setup') await cp(resolve('backend/database/migrations'), `${output}/migrations`, { recursive: true })
    // Build a new archive rather than updating an old zip: stale entries (such
    // as accidentally packaged env files) must not survive a rebuild.
    await execute('zip', ['-q', '-r', `${archiveDirectory}/${name}.zip`, 'index.js', 'package.json', 'certs', ...(name === 'setup' ? ['migrations'] : [])], { cwd: output })
    await rename(`${archiveDirectory}/${name}.zip`, `${directory}/${name}.zip`)
  }
  for (const environment of ['dev', 'prod'] as const) await writeFile(`${directory}/${environment}-grants.sql`, databaseApiGrants(environment))
  if (process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_APP_CLIENT_ID) {
    const template = databaseApiInfrastructure(process.env)
    await writeFile(`${directory}/${process.env.STUDIOSTACK_ENV}-routes.json`, JSON.stringify(template, null, 2))
    console.log('Generated JWT-protected route template for the explicitly configured environment')
  } else console.log('Route template pending: configure the environment, Cognito user pool and app client IDs')
  console.log('Prepared local packages and grants under .aws/database-api; nothing deployed or migrated')
}
main().catch(() => { console.error('API preparation failed; verify dependencies, certificate and explicit configuration'); process.exitCode = 1 })
