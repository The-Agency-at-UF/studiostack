// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { createDatabase, DatabaseClient } from '../../backend/database/client'
import { loadMigrations } from '../../backend/database/migrations'
import { databaseApiGrants } from '../../backend/database/api-grants'
import { createApiRepository } from '../../backend/database/api-repository'
import type { Identity } from '../../backend/database/api-repository'
import type { ApiEquipment, ApiPage, ApiReservation, ApiUser } from '../types/database-api'

const connectionString = process.env.DATABASE_API_TEST_URL
const integration = connectionString ? describe : describe.skip
integration('real PostgreSQL: restricted role, tenant isolation and concurrent reservations', () => {
  let operator: pg.Client
  const organizationId = randomUUID(), otherOrganizationId = randomUUID()
  const issuer = 'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_test'
  const owner: Identity = { issuer, subject: 'owner', email: null }
  const member: Identity = { issuer, subject: 'member', email: null }
  const secondMember: Identity = { issuer, subject: 'second-member', email: null }
  const outsider: Identity = { issuer, subject: 'outsider', email: null }
  const suspended: Identity = { issuer, subject: 'suspended', email: null }
  let profiles: Record<string, ApiUser>
  const repository = createApiRepository({
    async withClient<T>(operation: (client: DatabaseClient) => Promise<T>) {
      const client = new pg.Client({ connectionString, connectionTimeoutMillis: 2000 })
      try {
        await client.connect()
        // Local disposable DB only. Real SQL executes under the same restricted
        // role/grants as runtime; production TLS is covered by connection tests.
        await client.query('SET ROLE "studiostack_dev_app"')
        return await operation(client)
      } finally { await client.end() }
    },
  } as Pick<ReturnType<typeof createDatabase>, 'withClient'> )
  const listPage = { limit: 100, after: null }
  const startsAt = new Date(Date.now() + 86400_000).toISOString()
  const endsAt = new Date(Date.parse(startsAt) + 3600_000).toISOString()
  async function equipment() {
    return await repository.execute(owner, { operation: 'createEquipment', organizationId, input: { equipmentCode: `QR-${randomUUID()}`, name: 'Test camera', category: 'Camera & Accessories' } }) as ApiEquipment
  }
  function booking(item: ApiEquipment, requestId = randomUUID()) {
    return { name: 'Test booking', startsAt, endsAt, equipmentIds: [item.id], requestId }
  }
  beforeAll(async () => {
    const target = new URL(connectionString!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/studiostack_api_test') throw new Error('Integration tests require a disposable localhost studiostack_api_test database')
    operator = new pg.Client({ connectionString, connectionTimeoutMillis: 2000 })
    await operator.connect()
    // Do not reset/drop an existing schema: tests require a fresh test database.
    for (const migration of await loadMigrations()) await operator.query(migration.sql)
    await operator.query('CREATE ROLE "studiostack_dev_app" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT')
    await operator.query(databaseApiGrants('dev'))
    profiles = {}
    for (const identity of [owner, member, secondMember, outsider, suspended]) profiles[identity.subject] = await repository.execute(identity, { operation: 'register', displayName: identity.subject }) as ApiUser
    await operator.query('INSERT INTO app.organizations (id, slug, name) VALUES ($1, $2, $3), ($4, $5, $6)', [organizationId, 'test-org', 'Test Org', otherOrganizationId, 'other-org', 'Other Org'])
    for (const identity of [owner, member, secondMember, suspended]) await operator.query('INSERT INTO app.organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [organizationId, profiles[identity.subject].id, identity === owner ? 'owner' : 'member', identity === suspended ? 'suspended' : 'active'])
    await operator.query('INSERT INTO app.organization_memberships (organization_id, user_id, role, status) VALUES ($1, $2, $3, $4)', [otherOrganizationId, profiles.outsider.id, 'owner', 'active'])
  }, 30_000)
  afterAll(async () => { await operator?.end() })
  it('upserts only the current user and lists only active organizations', async () => {
    expect(await repository.execute(member, { operation: 'register', displayName: 'Updated' })).toMatchObject({ id: profiles.member.id, email: null, displayName: 'Updated' })
    expect(await repository.execute(member, { operation: 'organizations', page: listPage })).toMatchObject({ items: [{ id: organizationId }], nextCursor: null })
    expect(await repository.execute(suspended, { operation: 'organizations', page: listPage })).toMatchObject({ items: [] })
  })
  it('persists admin inventory changes and refuses member writes', async () => {
    const item = await equipment()
    expect(await repository.execute(owner, { operation: 'updateEquipment', organizationId, itemId: item.id, input: { name: 'Updated camera' } })).toMatchObject({ id: item.id, name: 'Updated camera' })
    await expect(repository.execute(member, { operation: 'updateEquipment', organizationId, itemId: item.id, input: { status: 'retired' } })).rejects.toMatchObject({ status: 403 })
    const list = await repository.execute(member, { operation: 'inventory', organizationId, page: { limit: 1, after: null } }) as ApiPage<ApiEquipment>
    expect(list.items).toHaveLength(1)
    if (list.nextCursor) expect((await repository.execute(member, { operation: 'inventory', organizationId, page: { limit: 1, after: list.nextCursor } }) as ApiPage<ApiEquipment>).items[0].id).not.toBe(list.items[0].id)
  })
  it('enforces admin-only member lists and group creation', async () => {
    const group = await repository.execute(owner, { operation: 'createGroup', organizationId, name: 'Editors' })
    expect(group).toMatchObject({ name: 'Editors' })
    expect(await repository.execute(member, { operation: 'groups', organizationId, page: listPage })).toMatchObject({ items: [group] })
    await expect(repository.execute(member, { operation: 'members', organizationId, page: listPage })).rejects.toMatchObject({ status: 403 })
    expect((await repository.execute(owner, { operation: 'members', organizationId, page: listPage }) as ApiPage<ApiUser>).items).toHaveLength(4)
  })
  it.each([outsider, suspended])('rejects unauthorized membership $subject', async identity => {
    await expect(repository.execute(identity, { operation: 'inventory', organizationId, page: listPage })).rejects.toMatchObject({ status: 403 })
  })
  it('permits exactly one of two simultaneous overlapping bookings', async () => {
    const item = await equipment()
    const results = await Promise.allSettled([member, secondMember].map(identity => repository.execute(identity, { operation: 'createReservation', organizationId, input: booking(item) })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ status: 409 }) })])
    const persisted = await operator.query('SELECT count(*)::int AS count FROM app.reservation_items WHERE equipment_id = $1', [item.id])
    expect(persisted.rows[0].count).toBe(1)
  })
  it('makes simultaneous retries idempotent and rejects changed content', async () => {
    const item = await equipment(), input = booking(item)
    const request = { operation: 'createReservation' as const, organizationId, input }
    const responses = await Promise.all([repository.execute(member, request), repository.execute(member, request)]) as ApiReservation[]
    expect(responses[0].id).toBe(responses[1].id)
    await expect(repository.execute(member, { ...request, input: { ...input, name: 'Changed' } })).rejects.toMatchObject({ status: 409 })
  })
  it('allows adjacent half-open time intervals but refuses overlapping intervals', async () => {
    const item = await equipment()
    await repository.execute(member, { operation: 'createReservation', organizationId, input: booking(item) })
    await expect(repository.execute(secondMember, { operation: 'createReservation', organizationId, input: booking(item) })).rejects.toMatchObject({ status: 409 })
    expect(await repository.execute(secondMember, { operation: 'createReservation', organizationId, input: { ...booking(item), startsAt: endsAt, endsAt: new Date(Date.parse(endsAt) + 3600_000).toISOString() } })).toMatchObject({ status: 'confirmed' })
  })
  it('keeps member reservations private, permits admin cancellation, and retains history', async () => {
    const item = await equipment()
    const result = await repository.execute(member, { operation: 'createReservation', organizationId, input: booking(item) }) as ApiReservation
    await expect(repository.execute(secondMember, { operation: 'reservation', organizationId, reservationId: result.id })).rejects.toMatchObject({ status: 404 })
    const ownList = await repository.execute(secondMember, { operation: 'reservations', organizationId, page: listPage }) as ApiPage<ApiReservation>
    expect(ownList.items.every(reservation => reservation.userId === profiles[secondMember.subject].id)).toBe(true)
    expect(await repository.execute(owner, { operation: 'cancelReservation', organizationId, reservationId: result.id })).toMatchObject({ status: 'cancelled' })
    expect(await repository.execute(member, { operation: 'reservation', organizationId, reservationId: result.id })).toMatchObject({ status: 'cancelled' })
    expect(await repository.execute(secondMember, { operation: 'createReservation', organizationId, input: booking(item) })).toMatchObject({ status: 'confirmed' })
  })
  it('refuses to retire an item with a future confirmed reservation', async () => {
    const item = await equipment()
    await repository.execute(member, { operation: 'createReservation', organizationId, input: booking(item) })
    await expect(repository.execute(owner, { operation: 'updateEquipment', organizationId, itemId: item.id, input: { status: 'retired' } })).rejects.toMatchObject({ status: 409 })
  })
  it('enforces RLS without context and excludes other organizations with context', async () => {
    await equipment()
    const connection = new pg.Client({ connectionString })
    try {
      await connection.connect(); await connection.query('SET ROLE "studiostack_dev_app"')
      expect((await connection.query('SELECT id FROM app.inventory')).rows).toEqual([])
      await connection.query('BEGIN')
      await connection.query("SELECT set_config('app.organization_id', $1, true)", [otherOrganizationId])
      expect((await connection.query('SELECT id FROM app.inventory')).rows).toEqual([])
      await expect(connection.query('INSERT INTO app.inventory (organization_id, equipment_code, name, category) VALUES ($1, $2, $3, $4)', [organizationId, 'wrong-org', 'Bad', 'Audio'])).rejects.toMatchObject({ code: '42501' })
      await connection.query('ROLLBACK')
    } finally { await connection.end() }
  })
  it('does not grant schema migration, hard-delete or membership-management permissions to runtime', async () => {
    const connection = new pg.Client({ connectionString })
    try {
      await connection.connect(); await connection.query('SET ROLE "studiostack_dev_app"')
      for (const sql of ['CREATE TABLE app.forbidden (id int)', 'UPDATE app.organization_memberships SET role = \'owner\'', 'DELETE FROM app.inventory']) {
        await expect(connection.query(sql)).rejects.toMatchObject({ code: '42501' })
      }
    } finally { await connection.end() }
  })
  it('rejects cross-organization equipment through composite foreign keys as well as the API', async () => {
    const ownItem = await equipment()
    const otherItem = await repository.execute(outsider, { operation: 'createEquipment', organizationId: otherOrganizationId, input: { equipmentCode: 'OTHER-QR', name: 'Other camera', category: 'Audio' } }) as ApiEquipment
    await expect(repository.execute(member, { operation: 'createReservation', organizationId, input: booking(otherItem) })).rejects.toMatchObject({ status: 409 })
    const reservation = await repository.execute(member, { operation: 'createReservation', organizationId, input: booking(ownItem) }) as ApiReservation
    const connection = new pg.Client({ connectionString })
    try {
      await connection.connect(); await connection.query('SET ROLE "studiostack_dev_app"'); await connection.query('BEGIN')
      await connection.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
      await expect(connection.query('INSERT INTO app.reservation_items (organization_id, reservation_id, equipment_id) VALUES ($1, $2, $3)', [organizationId, reservation.id, otherItem.id])).rejects.toMatchObject({ code: '23503' })
      await connection.query('ROLLBACK')
    } finally { await connection.end() }
  })
})
