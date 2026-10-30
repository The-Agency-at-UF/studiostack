import {reportRoutes} from '../../backend/equipment/report-routes'
import {equipmentRoutes} from '../../backend/equipment/routes'
import { productionRoutes } from '../../backend/production/routes'
import {accountRoutes} from '../../backend/accounts/routes'
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda'
import { apiConfiguration, createDatabaseApiHandler, databaseApiRoutes, databaseApiScope } from '../../backend/database/api'
import { ApiError, createEquipment, updateEquipment, createReservation, pagination } from '../../backend/database/api-validation'
import { createApiRepository } from '../../backend/database/api-repository'
import type { Identity } from '../../backend/database/api-repository'
import type { createDatabase } from '../../backend/database/client'
import { databaseApiInfrastructure } from '../../infra/database/api-resources'
import { databaseApiGrants } from '../../backend/database/api-grants'
import { loadMigrations } from '../../backend/database/migrations'

const org = '11111111-1111-4111-8111-111111111111'
const otherOrg = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const itemId = '44444444-4444-4444-8444-444444444444'
const reservationId = '55555555-5555-4555-8555-555555555555'
const requestId = '66666666-6666-4666-8666-666666666666'
const now = Date.parse('2030-01-01T00:00:00Z')
const config = { apiId: 'vugf6fpl4k', issuer: 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_example', clientId: 'exampleclient' }
const identity: Identity = { issuer: config.issuer, subject: 'trusted-subject', email: null }
const booking = { name: 'Shoot', startsAt: '2030-02-01T10:00:00.000Z', endsAt: '2030-02-01T12:00:00.000Z', equipmentIds: [itemId], requestId }
const user = { id: userId, email: null, displayName: 'Member' }

function event(routeKey = 'GET /me', body?: unknown): APIGatewayProxyEventV2WithJWTAuthorizer {
  return { version: '2.0', routeKey, rawPath: '/me', rawQueryString: '', headers: {}, isBase64Encoded: false,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    pathParameters: { organizationId: org, itemId, reservationId },
    requestContext: { routeKey, apiId: config.apiId, accountId: '423563856930', domainName: 'example.execute-api.us-east-2.amazonaws.com', domainPrefix: 'example', stage: '$default', requestId: 'test-request', time: '01/Jan/2030:00:00:00 +0000', timeEpoch: now,
      http: { method: routeKey.split(' ')[0], path: '/me', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' }, authorizer: { jwt: { scopes: [databaseApiScope], claims: {
      iss: config.issuer, client_id: config.clientId, token_use: 'access', sub: identity.subject, exp: String(now / 1000 + 3600), scope: databaseApiScope,
    } } } },
  }
}
function repoFixture(role = 'member') {
  let existing: Record<string, unknown> | undefined
  let overlap = false
  let available = true
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    let rows: unknown[] = []
    if (sql.includes('FROM app.users WHERE') || sql.startsWith('INSERT INTO app.users')) rows = [user]
    else if(sql.startsWith('SELECT reservation_days AS days'))rows=[{days:7}]
    else if (sql.includes('SELECT m.role FROM')) rows = values[0] === org ? [{ role }] : []
    else if (sql.includes('r.request_hash')) rows = existing ? [existing] : []
    else if (sql.includes('SELECT id, status FROM app.inventory')) rows = [{ id: itemId, status: available ? 'available' : 'maintenance' }]
    else if (sql.startsWith('SELECT id FROM app.inventory')) rows = values[1] === itemId ? [{ id: itemId }] : []
    else if (sql.startsWith('SELECT 1 FROM app.reservation_items')) rows = overlap ? [{ value: 1 }] : []
    else if (sql.startsWith('INSERT INTO app.reservations')) rows = [{ id: reservationId }]
    else if (sql.includes('FROM app.reservations r WHERE')) rows = [{ id: reservationId, userId, status: 'confirmed', equipmentIds: [itemId] }]
    else if (sql.startsWith('UPDATE app.reservations')) rows = [{ status: 'cancelled' }]
    return { rows, rowCount: rows.length }
  })
  const database = { withClient: async (operation: (client: { query: typeof query }) => Promise<unknown>) => operation({ query }) } as unknown as Pick<ReturnType<typeof createDatabase>, 'withClient'>
  return { query, repository: createApiRepository(database, () => now), setPrevious: (value: Record<string, unknown>) => { existing = value }, setOverlap: () => { overlap = true }, setUnavailable: () => { available = false } }
}

describe('trusted API identity and strict HTTP inputs', () => {
  it.each([
    ['POST /organizations/{organizationId}/production/briefs/{briefId}/actions', {action:'approve',version:1,requestId}, {briefId:itemId}],
    ['POST /organizations/{organizationId}/production/deliveries/{deliveryId}/retry', {}, {deliveryId:itemId}],
  ])('signals committed production work without logging customer data: %s',async(route,body,parameters)=>{
    const log=vi.spyOn(console,'log').mockImplementation(()=>{})
    try {
      const execute=vi.fn().mockResolvedValue({projectName:'Private client brief'}),handler=createDatabaseApiHandler({execute},config,()=>now),request=event(route,body)
      Object.assign(request.pathParameters!,parameters)
      expect((await handler(request)).statusCode).toBe(200)
      expect(log).toHaveBeenCalledExactlyOnceWith(JSON.stringify({type:'production-decision-queued'}))
      log.mockClear();execute.mockRejectedValue(new Error('Transaction failed'))
      expect((await handler(request)).statusCode).toBe(503)
      expect(log).not.toHaveBeenCalled()
    } finally {log.mockRestore()}
  })
  it('uses only the authorizer identity and does not invent an email from access tokens', async () => {
    const execute = vi.fn().mockResolvedValue(user)
    const response = await createDatabaseApiHandler({ execute }, config, () => now)(event())
    expect(response.statusCode).toBe(200)
    expect(execute).toHaveBeenCalledWith(identity, { operation: 'me' })
    expect(response.headers).toMatchObject({ 'Cache-Control': 'no-store' })
  })
  it.each([
    { sub: '' }, { iss: 'https://attacker.invalid' }, { client_id: 'other-client' }, { token_use: 'id' },
    { exp: '0' }, { exp: 'bad' }, { scope: 'openid email' },
  ])('rejects invalid claims before any database call %j', async override => {
    const execute = vi.fn(), request = event()
    Object.assign(request.requestContext.authorizer.jwt.claims, override)
    expect((await createDatabaseApiHandler({ execute }, config, () => now)(request)).statusCode).toBe(401)
    expect(execute).not.toHaveBeenCalled()
  })
  it('rejects missing authorizer and wrong API Gateway identity', async () => {
    const execute = vi.fn(), handler = createDatabaseApiHandler({ execute }, config, () => now)
    const unauthenticated = event()
    delete (unauthenticated.requestContext as { authorizer?: unknown }).authorizer
    expect((await handler(unauthenticated)).statusCode).toBe(401)
    const wrongApi = event(); wrongApi.requestContext.apiId = 'prod-api'
    expect((await handler(wrongApi)).statusCode).toBe(401)
    expect(execute).not.toHaveBeenCalled()
  })
  it.each([
    ['POST /me', { email: 'owner@example.com', isAdmin: true }],
    ['POST /organizations/{organizationId}/inventory', { name: 'Camera', category: 'Audio', equipmentCode: 'QR1', organizationId: otherOrg }],
    ['POST /organizations/{organizationId}/reservations', { ...booking, userId: 'someone-else' }],
    ['POST /organizations/{organizationId}/reservations/{reservationId}/cancel', { status: 'confirmed' }],
  ])('rejects mass assignment on %s', async (route, body) => {
    const execute = vi.fn()
    expect((await createDatabaseApiHandler({ execute }, config, () => now)(event(route, body))).statusCode).toBe(400)
    expect(execute).not.toHaveBeenCalled()
  })
  it('accepts bounded base64 JSON, rejects malformed/oversized JSON and unknown routes', async () => {
    const execute = vi.fn().mockResolvedValue(user), handler = createDatabaseApiHandler({ execute }, config, () => now)
    const request = event('POST /me'); request.isBase64Encoded = true; request.body = Buffer.from('{"displayName":"Me"}').toString('base64')
    expect((await handler(request)).statusCode).toBe(200)
    request.body = 'broken'
    expect((await handler(request)).statusCode).toBe(400)
    request.isBase64Encoded = false; request.body = 'x'.repeat(25000)
    expect((await handler(request)).statusCode).toBe(400)
    expect((await handler(event('GET /sql'))).statusCode).toBe(404)
  })
  it('redacts driver and credential details', async () => {
    const response = await createDatabaseApiHandler({ execute: vi.fn().mockRejectedValue(new Error('password=SECRET; SELECT private')) }, config, () => now)(event())
    expect(response.statusCode).toBe(503)
    expect(response.body).not.toMatch(/SECRET|SELECT|password/)
  })
  it('uses verified email claims only, never the profile request body', async () => {
    const execute = vi.fn().mockResolvedValue(user), request = event('POST /me', {})
    Object.assign(request.requestContext.authorizer.jwt.claims, { email: 'real@example.com', email_verified: 'true' })
    await createDatabaseApiHandler({ execute }, config, () => now)(request)
    expect(execute.mock.calls[0][0].email).toBe('real@example.com')
  })
  it('validates organization-scoped processed photo authorization', async () => {
    const execute = vi.fn().mockResolvedValue({}), handler = createDatabaseApiHandler({ execute }, config, () => now)
    const input = { organizationId: org, contentType: 'image/jpeg', size: 1024, requestId }
    expect((await handler(event('POST /photos/uploads', input))).statusCode).toBe(200)
    expect(execute).toHaveBeenCalledWith(identity, { operation: 'photoUpload', organizationId: org, input })
    for (const change of [{ size: 0 }, { size: 10485761 }, { contentType: 'image/png' }, { organizationId: 'bad' }, { key: 'another-user-photo' }, { requestId: 'bad' }]) {
      execute.mockClear()
      expect((await handler(event('POST /photos/uploads', { ...input, ...change }))).statusCode).toBe(400)
      expect(execute).not.toHaveBeenCalled()
    }
  })
  it('routes completion and download without accepting an object key', async () => {
    const execute = vi.fn().mockResolvedValue({}), handler = createDatabaseApiHandler({ execute }, config, () => now)
    const completion = event('POST /organizations/{organizationId}/photos/{photoId}/complete', {})
    completion.pathParameters!.photoId = itemId
    expect((await handler(completion)).statusCode).toBe(200)
    expect(execute).toHaveBeenCalledWith(identity, { operation: 'completePhoto', organizationId: org, photoId: itemId })
    completion.body = '{"key":"photos/attacker/key.jpg"}'
    expect((await handler(completion)).statusCode).toBe(400)
    expect((await handler(event('GET /organizations/{organizationId}/inventory/{itemId}/photo'))).statusCode).toBe(200)
    expect(execute).toHaveBeenCalledWith(identity, { operation: 'downloadPhoto', organizationId: org, itemId })
  })
})

describe('tenant authorization and atomic repository operations', () => {
  it('denies another organization before setting tenant context or reading inventory', async () => {
    const { repository, query } = repoFixture()
    await expect(repository.execute(identity, { operation: 'inventory', organizationId: otherOrg, page: { limit: 50, after: null } })).rejects.toMatchObject({ status: 403 })
    expect(query.mock.calls.some(call => call[0].includes('set_config') || call[0].includes('FROM app.inventory'))).toBe(false)
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  })
  it('sets transaction-local RLS context only after active membership and bounds pagination', async () => {
    const { repository, query } = repoFixture()
    await repository.execute(identity, { operation: 'inventory', organizationId: org, page: { limit: 10, after: null } })
    expect(query).toHaveBeenCalledWith("SELECT set_config('app.organization_id', $1, true)", [org])
    const select = query.mock.calls.find(call => call[0].includes('SELECT id, equipment_code'))!
    expect(select[0]).toContain('organization_id = $1')
    expect(select[1]).toEqual([org, null, 11])
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT')
  })
  it.each(['members', 'createGroup', 'createEquipment', 'updateEquipment'] as const)('requires an admin for %s', async operation => {
    const { repository, query } = repoFixture()
    const request = operation === 'members' ? { operation, organizationId: org, page: { limit: 50, after: null } }
      : operation === 'createGroup' ? { operation, organizationId: org, name: 'Editors' }
      : operation === 'createEquipment' ? { operation, organizationId: org, input: { equipmentCode: 'QR1', name: 'Camera', category: 'Audio' as const } }
      : { operation, organizationId: org, itemId, input: { name: 'Changed' } }
    await expect(repository.execute(identity, request)).rejects.toMatchObject({ status: 403 })
    expect(query.mock.calls.some(call => /^(INSERT|UPDATE)/.test(call[0]))).toBe(false)
  })
  it('parameterizes profile text without granting membership or admin privileges', async () => {
    const { repository, query } = repoFixture(), displayName = "'; DROP TABLE app.users; --"
    await repository.execute(identity, { operation: 'register', displayName })
    const insert = query.mock.calls.find(call => call[0].startsWith('INSERT'))!
    expect(insert[0]).not.toContain(displayName)
    expect(insert[1]).toEqual([identity.issuer, identity.subject, null, displayName])
    expect(query.mock.calls.some(call => /INSERT INTO app.organization/.test(call[0]))).toBe(false)
  })
  it('restricts regular reservation lists to the caller', async () => {
    const { repository, query } = repoFixture()
    await repository.execute(identity, { operation: 'reservations', organizationId: org, page: { limit: 50, after: null } })
    const select = query.mock.calls.find(call => call[0].includes('($4::boolean OR r.user_id = $5)'))!
    expect(select[1]).toEqual([org, null, 51, false, userId])
  })
  it('locks equipment before checking overlaps, then inserts everything in one transaction', async () => {
    const { repository, query } = repoFixture()
    await repository.execute(identity, { operation: 'createReservation', organizationId: org, input: booking })
    const sql = query.mock.calls.map(call => call[0])
    expect(sql[0]).toBe('BEGIN ISOLATION LEVEL READ COMMITTED')
    expect(sql.findIndex(statement => statement.includes('ORDER BY id FOR UPDATE'))).toBeLessThan(sql.findIndex(statement => statement.startsWith('SELECT 1 FROM app.reservation_items')))
    expect(sql.filter(statement => statement.startsWith('INSERT'))).toHaveLength(2)
    expect(sql.at(-1)).toBe('COMMIT')
  })
  it.each(['overlap', 'unavailable'])('rolls back %s without creating a reservation', async reason => {
    const fixture = repoFixture()
    if (reason === 'overlap') fixture.setOverlap(); else fixture.setUnavailable()
    await expect(fixture.repository.execute(identity, { operation: 'createReservation', organizationId: org, input: booking })).rejects.toMatchObject({ status: 409 })
    expect(fixture.query.mock.calls.some(call => call[0].startsWith('INSERT'))).toBe(false)
    expect(fixture.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  })
  it('returns a retry without another insert; changed content with the same ID conflicts', async () => {
    const fixture = repoFixture()
    await fixture.repository.execute(identity, { operation: 'createReservation', organizationId: org, input: booking })
    const fingerprint = fixture.query.mock.calls.find(call => call[0].startsWith('INSERT INTO app.reservations'))![1]![6]
    fixture.setPrevious({ id: reservationId, userId, requestHash: fingerprint })
    fixture.query.mockClear()
    expect(await fixture.repository.execute(identity, { operation: 'createReservation', organizationId: org, input: booking })).toEqual({ id: reservationId, userId })
    expect(fixture.query.mock.calls.some(call => call[0].startsWith('INSERT'))).toBe(false)
    await expect(fixture.repository.execute(identity, { operation: 'createReservation', organizationId: org, input: { ...booking, name: 'Different' } })).rejects.toMatchObject({ status: 409 })
  })
  it('does not expose somebody else’s reservation to regular members', async () => {
    const fixture = repoFixture()
    fixture.query.mockImplementation(async sql => ({ rows: sql.includes('FROM app.users WHERE') ? [user]
      : sql.includes('SELECT m.role FROM') ? [{ role: 'member' }] : sql.includes('FROM app.reservations r WHERE') ? [{ id: reservationId, userId: 'another-user' }] : [], rowCount: 0 }))
    await expect(fixture.repository.execute(identity, { operation: 'cancelReservation', organizationId: org, reservationId })).rejects.toMatchObject({ status: 404 })
    expect(fixture.query.mock.calls.some(call => call[0].startsWith('UPDATE'))).toBe(false)
  })
  it('cancels without deleting the reservation', async () => {
    const fixture = repoFixture()
    expect(await fixture.repository.execute(identity, { operation: 'cancelReservation', organizationId: org, reservationId })).toMatchObject({ status: 'cancelled' })
    expect(fixture.query.mock.calls.some(call => call[0].startsWith('DELETE'))).toBe(false)
  })
  it('refuses to retire booked equipment', async () => {
    const fixture = repoFixture('admin'); fixture.setOverlap()
    await expect(fixture.repository.execute(identity, { operation: 'updateEquipment', organizationId: org, itemId, input: { status: 'retired' } })).rejects.toMatchObject({ status: 409 })
    expect(fixture.query.mock.calls.some(call => call[0].startsWith('UPDATE'))).toBe(false)
  })
  it('maps unique violations to a generic conflict and rolls back', async () => {
    const fixture = repoFixture('admin')
    fixture.query.mockImplementation(async sql => {
      if (sql.startsWith('INSERT')) throw { code: '23505', detail: 'PRIVATE' }
      return { rows: sql.includes('FROM app.users WHERE') ? [user] : sql.includes('SELECT m.role FROM') ? [{ role: 'admin' }] : [], rowCount: 0 }
    })
    await expect(fixture.repository.execute(identity, { operation: 'createGroup', organizationId: org, name: 'Editors' })).rejects.toMatchObject({ status: 409, message: 'A record with these unique details already exists' })
    expect(fixture.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK')
  })
})

describe('validation, additive infrastructure and least-privilege grants', () => {
  it.each([{ limit: '0' }, { limit: '101' }, { limit: '-1' }, { limit: 'NaN' }, { after: 'bad' }, { orderBy: 'SQL' }])('rejects unsafe pagination %j', input => {
    expect(() => pagination(input)).toThrow(ApiError)
  })
  it('validates equipment codes/categories and rejects empty patches', () => {
    expect(createEquipment({ name: 'Camera', equipmentCode: 'QR-1', category: 'Camera & Accessories' })).toMatchObject({ equipmentCode: 'QR-1' })
    expect(() => createEquipment({ name: 'Camera', equipmentCode: 'https://example.com', category: 'Audio' })).toThrow(ApiError)
    expect(() => updateEquipment({})).toThrow(ApiError)
    expect(() => updateEquipment({ status: 'checked-out' })).toThrow(ApiError)
  })
  it.each([
    { startsAt: 'yesterday' }, { startsAt: '2030-02-30T10:00:00Z' }, { startsAt: '2030-02-01T10:00:00' }, { endsAt: booking.startsAt },
    { endsAt: '2031-01-01T00:00:00Z' }, { equipmentIds: [] }, { equipmentIds: [itemId, itemId] },
    { equipmentIds: Array.from({ length: 51 }, () => itemId) }, { requestId: 'not-an-id' },
  ])('rejects invalid reservations %j', override => {
    expect(() => createReservation({ ...booking, ...override }, now)).toThrow(ApiError)
  })
  it('normalizes timezone offsets and item ordering', () => {
    expect(createReservation({ ...booking, startsAt: '2030-02-01T05:00:00-05:00' }, now).startsAt).toBe(booking.startsAt)
  })
  it('requires explicit dev/prod API and Cognito configuration', () => {
    expect(() => apiConfiguration({ STUDIOSTACK_ENV: 'dev', DATABASE_API_ID: 'ixzikwz8n5' })).toThrow()
    expect(() => apiConfiguration({ STUDIOSTACK_ENV: 'dev', DATABASE_API_ID: 'vugf6fpl4k' })).toThrow('Cognito')
  })
  it('gives every route JWT authorization and a required access scope; permissions target the matching API', () => {
    const template = databaseApiInfrastructure({ STUDIOSTACK_ENV: 'dev', DATABASE_API_ID: config.apiId, COGNITO_USER_POOL_ID: 'us-east-2_example', COGNITO_APP_CLIENT_ID: config.clientId })
    const routes = Object.values(template.Resources).filter((resource: unknown) => (resource as { Type: string }).Type === 'AWS::ApiGatewayV2::Route') as { Properties: { AuthorizationType: string; AuthorizationScopes: string[]; RouteKey: string } }[]
    expect(routes).toHaveLength(databaseApiRoutes.length + productionRoutes.length + accountRoutes.length + equipmentRoutes.length + reportRoutes.length)
    expect(routes.every(route => route.Properties.AuthorizationType === 'JWT' && route.Properties.AuthorizationScopes.includes(databaseApiScope))).toBe(true)
    const serialized = JSON.stringify(template)
    expect(serialized).toContain(`${config.apiId}/*/GET/me`)
    expect(serialized).not.toMatch(/AWS::IAM::Role|AWS::Lambda::Url|ixzikwz8n5|rds!cluster|photos\/uploads/)
  })
  it('limits administration grants to reviewed columns and team links without DDL', async () => {
    const migration = (await loadMigrations()).find(value => value.name.startsWith('002_'))!
    expect(migration.sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(5)
    expect(migration.sql).toContain('FOREIGN KEY (organization_id, equipment_id)')
    const grants = databaseApiGrants('dev')
    expect(grants).toContain('GRANT UPDATE (name,starts_at,ends_at,status,version,fulfillment_status,checked_out_at,returned_at) ON app.reservations')
    expect(grants).not.toMatch(/GRANT ALL|schema_migrations|TO "studiostack_prod_app"|CREATE/)
    expect(grants.split(';').filter(statement=>statement.includes('DELETE')).map(s=>s.trim())).toEqual(['GRANT INSERT, DELETE ON app.user_group_memberships TO "studiostack_dev_app"','GRANT DELETE ON app.reservation_items TO "studiostack_dev_app"'])
    expect(grants).toContain('GRANT UPDATE (role, status, version) ON app.organization_memberships')
  })
})
