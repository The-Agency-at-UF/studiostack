import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { account, region } from '../infra/database/resources'

const execute = promisify(execFile)
export const devDirectory = resolve('.aws/dev-rollout')
export const pause = (ms = 5000) => new Promise(done => setTimeout(done, ms))
export async function aws<T = unknown>(service: string, operation: string, args: string[] = []): Promise<T> {
  // Never expose CLI input/output on an error: it may contain test passwords,
  // signed forms or credentials. Callers report only their named stage.
  try {
    // GitHub Actions authenticates with short-lived OIDC credentials in the environment.
    const profile = process.env.GITHUB_ACTIONS === 'true' ? [] : ['--profile', 'studiostack-dev']
    const result = await execute(process.env.AWS_CLI_PATH ?? 'aws', [service, operation, ...args, ...profile, '--region', region, '--output', 'json', '--no-cli-pager'], { maxBuffer: 8 * 1024 * 1024 })
    return (result.stdout.trim() ? JSON.parse(result.stdout) : undefined) as T
  } catch (error) {
    if ((error as { stderr?: string }).stderr?.includes('No updates are to be performed')) return undefined as T
    const code = (error as { stderr?: string }).stderr?.match(/An error occurred \(([A-Za-z0-9]+)\)/)?.[1]
    throw Object.assign(new Error(`AWS operation failed: ${service} ${operation}${code ? ` (${code})` : ''}`), { code })
  }
}
export async function guardDevApply() {
  if (process.argv.slice(2).join(' ') !== '--apply-dev') throw new Error('Explicit approved --apply-dev required')
  await mkdir(devDirectory, { recursive: true })
  if ((await aws<{ Account: string }>('sts', 'get-caller-identity')).Account !== account) throw new Error('Unexpected AWS account')
}
export async function applyStack(name: string, template: unknown) {
  const file = `${devDirectory}/${name}.json`
  const body=JSON.stringify(template)
  if(Buffer.byteLength(body)>51200)throw new Error('CloudFormation template exceeds inline limit; use a private S3 template URL')
  await writeFile(file,body)
  const { StackSummaries } = await aws<{ StackSummaries: { StackName: string; StackStatus: string }[] }>('cloudformation', 'list-stacks')
  const existing = StackSummaries.some(s => s.StackName === name && s.StackStatus !== 'DELETE_COMPLETE')
  if (existing) {
    const { Stacks: [stack] } = await aws<{ Stacks: { Tags?: { Key: string; Value: string }[] }[] }>('cloudformation', 'describe-stacks', ['--stack-name', name])
    if (!stack.Tags?.some(t => t.Key === 'ManagedBy' && t.Value === 'StudioStack')) throw new Error('Unowned stack')
  }
  await aws('cloudformation', existing ? 'update-stack' : 'create-stack', ['--stack-name', name, '--template-body', `file://${file}`, '--capabilities', 'CAPABILITY_NAMED_IAM', '--tags', 'Key=ManagedBy,Value=StudioStack'])
  let last = ''
  for (let i = 0; i < 180; i++) {
    const { Stacks: [stack] } = await aws<{ Stacks: { StackStatus: string; Outputs?: { OutputKey: string; OutputValue: string }[] }[] }>('cloudformation', 'describe-stacks', ['--stack-name', name])
    if (last !== stack.StackStatus) { console.log(`${name}: ${stack.StackStatus}`); last = stack.StackStatus }
    if (['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(last)) return Object.fromEntries((stack.Outputs ?? []).map(o => [o.OutputKey, o.OutputValue]))
    if (!last.endsWith('_IN_PROGRESS')) throw new Error(`Stack did not complete: ${name}`)
    await pause()
  }
  throw new Error(`Stack timed out: ${name}`)
}
export async function waitFunction(name: string) {
  for (let i = 0; i < 120; i++) {
    const fn = await aws<{ State: string; LastUpdateStatus?: string }>('lambda', 'get-function-configuration', ['--function-name', name])
    if (fn.State === 'Active' && (!fn.LastUpdateStatus || fn.LastUpdateStatus === 'Successful')) return
    if (fn.State === 'Failed' || fn.LastUpdateStatus === 'Failed') throw new Error(`Function update failed: ${name}`)
    await pause()
  }
  throw new Error('Function update timed out')
}
export async function invoke<T>(name: string, payload: unknown): Promise<T> {
  const path = `${devDirectory}/${name}-response.json`
  const result = await aws<{ FunctionError?: string }>('lambda', 'invoke', ['--function-name', name, '--payload', JSON.stringify(payload), '--cli-binary-format', 'raw-in-base64-out', '--cli-read-timeout', '120', path])
  const value = JSON.parse(await readFile(path, 'utf8'))
  if (result.FunctionError) {
    const detail = typeof value.errorMessage === 'string' && /^Database API schema setup unavailable \([A-Za-z0-9/]+\)$/.test(value.errorMessage) ? `: ${value.errorMessage}` : ''
    throw new Error(`Lambda verification failed: ${name}${detail}`)
  }
  return value as T
}
