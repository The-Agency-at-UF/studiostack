import { randomUUID, randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { guardDevApply, aws, devDirectory, pause } from './dev-aws'
import { readMetadata, withMaintenance, invokeMaintenance } from './deploy-dev-api'
import { syntheticSignIn } from './test-dev-auth'
import type { TestIdentity } from './test-dev-auth'

async function main() {
  await guardDevApply()
  const metadata = await readMetadata(), runId = `20261013-${randomBytes(4).toString('hex')}`, organizationId = randomUUID(), otherOrganizationId = randomUUID()
  const users: TestIdentity[] = []
  const checks: string[] = [], keys: string[] = []
  const fixture = { action: 'seed' as 'seed' | 'digest' | 'cleanup', organizationId, otherOrganizationId, issuer: metadata.auth.Issuer, subjects: [] as string[] }
  let seeded = false
  try {
    for (const name of ['owner', 'member', 'outsider']) users.push(await syntheticSignIn(metadata, runId, name))
    fixture.subjects = users.map(u => u.subject)
    await withMaintenance(metadata, runId, async () => {
      const result = await invokeMaintenance<{ ok: boolean }>(fixture)
      if (!result.ok) throw new Error('Fixture seed failed')
      seeded = true
    })
    const base = 'https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com', org = `/organizations/${organizationId}`
    const [owner, member, outsider] = users
    async function request(path: string, method: string, identity?: TestIdentity, body?: unknown, expected = 200, tokenOverride?: string) {
      await pause(600) // Honor the low-cost development stage's 2 requests/second.
      const response = await fetch(`${base}${path}`, { method, headers: { ...(identity ? { Authorization: `Bearer ${tokenOverride ?? identity.token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(35_000) })
      if (response.status !== expected) throw new Error(`HTTP check failed ${method} ${path}: expected ${expected}, received ${response.status}`)
      checks.push(`${method} ${path.replace(organizationId, '{org}')}: ${expected}`)
      return response.status === 200 ? response.json() as Promise<{ id?: string; items?: { id: string }[]; photoId?: string; fields?: Record<string, string>; url?: string }> : undefined
    }
    // Exercise all thirteen application routes with real signed Cognito tokens.
    await request('/me', 'GET', undefined, undefined, 401)
    await request('/me', 'GET', owner, undefined, 403, owner.idToken)
    await request('/me', 'GET', owner, undefined, 401, `${owner.token.slice(0, -4)}xxxx`)
    for (const user of users) await request('/me', 'POST', user, { displayName: 'Synthetic verification user' })
    await request('/me', 'GET', owner)
    const orgs = await request('/organizations', 'GET', member)
    if (orgs!.items?.length !== 1 || orgs!.items[0].id !== organizationId) throw new Error('Tenant list isolation failed')
    await request(`${org}/members`, 'GET', owner)
    await request(`${org}/members`, 'GET', member, undefined, 403)
    await request(`${org}/groups`, 'POST', owner, { name: `Verification ${runId}` })
    await request(`${org}/groups`, 'GET', member)
    await request(`${org}/groups`, 'POST', member, { name: 'Denied' }, 403)
    const item = await request(`${org}/inventory`, 'POST', owner, { equipmentCode: `TEST-${runId}`, name: 'Synthetic camera', category: 'Camera & Accessories' })
    await request(`${org}/inventory`, 'GET', member)
    await request(`${org}/inventory`, 'GET', outsider, undefined, 403)
    await request(`${org}/inventory`, 'POST', member, { equipmentCode: 'DENIED', name: 'Denied', category: 'Audio' }, 403)
    await request(`${org}/inventory/${item!.id}`, 'PATCH', owner, { name: 'Synthetic updated camera' })
    const startsAt = new Date(Date.now() + 86400_000).toISOString(), endsAt = new Date(Date.now() + 90000_000).toISOString()
    const booking = { name: 'Synthetic reservation', startsAt, endsAt, equipmentIds: [item!.id], requestId: randomUUID() }
    const reservation = await request(`${org}/reservations`, 'POST', member, booking)
    const repeated = await request(`${org}/reservations`, 'POST', member, booking)
    if (reservation!.id !== repeated!.id) throw new Error('Reservation idempotency failed')
    await request(`${org}/reservations`, 'POST', owner, { ...booking, requestId: randomUUID() }, 409)
    await request(`${org}/reservations`, 'GET', member)
    await request(`${org}/reservations/${reservation!.id}`, 'GET', member)
    await request(`${org}/reservations/${reservation!.id}/cancel`, 'POST', member, {})
    const photo = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#3344ff' } }).jpeg().withMetadata().toBuffer()
    const input = { organizationId, contentType: 'image/jpeg', size: photo.length, requestId: randomUUID() }
    await request('/photos/uploads', 'POST', undefined, input, 401)
    await request('/photos/uploads', 'POST', member, input, 403)
    await request('/photos/uploads', 'POST', outsider, input, 403)
    const upload = await request('/photos/uploads', 'POST', owner, input)
    keys.push(upload!.fields!.key)
    await request(`${org}/inventory/${item!.id}`, 'PATCH', owner, { photoId: upload!.photoId }, 409)
    await request(`${org}/photos/${upload!.photoId}/complete`, 'POST', owner, {}, 409)
    const form = new FormData()
    for (const [key, value] of Object.entries(upload!.fields!)) form.append(key, value)
    form.append('file', new Blob([photo], { type: 'image/jpeg' }), 'synthetic.jpg')
    const posted = await fetch(upload!.url!, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(20_000) })
    if (!posted.ok) throw new Error(`Private S3 upload failed (${posted.status})`)
    checks.push('S3 authorized POST: success')
    await request(`${org}/photos/${upload!.photoId}/complete`, 'POST', owner, {})
    await request(`${org}/photos/${upload!.photoId}/complete`, 'POST', owner, {})
    await request(`${org}/inventory/${item!.id}`, 'PATCH', owner, { photoId: upload!.photoId })
    keys.push(`photos/${organizationId}/${upload!.photoId}.jpg`)
    const download = await request(`${org}/inventory/${item!.id}/photo`, 'GET', member)
    const downloaded = await fetch(download!.url!, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
    const image = await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata()
    if (!downloaded.ok || image.format !== 'jpeg' || image.width !== 120 || image.height !== 80 || image.exif || image.icc) throw new Error('Photo byte validation failed')
    checks.push('Private download: valid JPEG, original EXIF/ICC removed')
    await request(`${org}/inventory/${item!.id}/photo`, 'GET', outsider, undefined, 403)
    const unsigned = new URL(download!.url!); unsigned.search = ''
    if ((await fetch(unsigned, { redirect: 'error' })).status !== 403) throw new Error('Photo unexpectedly public')
    checks.push('Unsigned S3 object read: 403')
    const invalidBytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#fff' } }).png().toBuffer()
    const invalidUpload = await request('/photos/uploads', 'POST', owner, { ...input, size: invalidBytes.length, requestId: randomUUID() })
    keys.push(invalidUpload!.fields!.key)
    const invalidForm = new FormData()
    for (const [key, value] of Object.entries(invalidUpload!.fields!)) invalidForm.append(key, value)
    invalidForm.append('file', new Blob([invalidBytes], { type: 'image/jpeg' }), 'spoofed.jpg')
    if (!(await fetch(invalidUpload!.url!, { method: 'POST', body: invalidForm, redirect: 'error' })).ok) throw new Error('Synthetic spoof test upload failed')
    await request(`${org}/photos/${invalidUpload!.photoId}/complete`, 'POST', owner, {}, 400)
    await request(`${org}/inventory/${item!.id}`, 'PATCH', owner, { photoId: invalidUpload!.photoId }, 409)
    checks.push('Spoofed PNG declared as JPEG: completion and attachment refused')
    const wrongSize = new FormData()
    for (const [key, value] of Object.entries(upload!.fields!)) wrongSize.append(key, value)
    wrongSize.append('file', new Blob([Buffer.concat([photo, Buffer.from('extra')])], { type: 'image/jpeg' }), 'oversize.jpg')
    if ((await fetch(upload!.url!, { method: 'POST', body: wrongSize, redirect: 'error' })).ok) throw new Error('S3 exact-size policy was bypassed')
    checks.push('S3 exact-size POST policy: wrong size refused')
    const checkpoint = new Date().toISOString()
    let digest: unknown
    await withMaintenance(metadata, runId, async () => { digest = await invokeMaintenance({ ...fixture, action: 'digest' }) })
    await writeFile(`${devDirectory}/verification.json`, JSON.stringify({ runId, fixture, keys, checks, checkpoint, digest, verifiedAt: new Date().toISOString(), fixtureCleanupPending: true }, null, 2))
    console.log(`Verified ${checks.length} live HTTP/photo checks. Isolated fixtures retained for the approved restore drill; no credentials written.`)
  } catch (error) {
    // Retain precise non-secret cleanup manifest, even for partial verification.
    await writeFile(`${devDirectory}/verification-pending.json`, JSON.stringify({ runId, fixture, keys, seeded }, null, 2))
    throw error
  } finally {
    for (const user of users) await aws('cognito-idp', 'admin-delete-user', ['--user-pool-id', metadata.auth.UserPoolId, '--username', user.username])
    console.log('Synthetic Cognito accounts removed')
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Dev verification failed'); process.exitCode = 1 })
