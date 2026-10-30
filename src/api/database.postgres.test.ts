import {feedbackTask,emailHash,type FeedbackRequest} from '../../backend/email/feedback'
import {alertOutboxTask,type AlertOutboxRequest} from '../../backend/alerts/outbox'
import type {AlertRequest} from '../../backend/alerts/routes'
import type {AppAlert,AlertPreferences} from '../types/alerts'
import type {ReportRequest} from '../../backend/equipment/report-routes'
import type {EquipmentRequest} from '../../backend/equipment/routes'
import type {EquipmentReservation,EquipmentReport,EquipmentAvailability} from '../types/equipment'
// @vitest-environment node
import { outboxTask } from '../../backend/production/outbox'
import {directoryTask,type DirectoryRequest} from '../../backend/accounts/directory'
import {invitationQueueTask,type InvitationQueueRequest} from '../../backend/accounts/queue'
import type {AccountRequest} from '../../backend/accounts/routes'
import type {ManagedMember,ManagedTeam,OrganizationInvitation,OrganizationSettings} from '../types/accounts'
import type { ProductionRequest } from '../../backend/production/repository'
import { emptyBrief, type ProductionBrief, type BriefCommand } from '../types/production'
import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { createDatabase, DatabaseClient } from '../../backend/database/client'
import { loadMigrations } from '../../backend/database/migrations'
import { databaseApiGrants } from '../../backend/database/api-grants'
import { createApiRepository } from '../../backend/database/api-repository'
import type { Identity } from '../../backend/database/api-repository'
import type { ApiEquipment, ApiPage, ApiReservation, ApiUser, ApiOrganization } from '../types/database-api'

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
  } as Pick<ReturnType<typeof createDatabase>, 'withClient'>, Date.now, {
    signUpload: async photo => ({ url: 'https://private.test', fields: { key: photo.stagingKey } }),
    finalize: async photo => ({ key: `photos/${photo.organizationId}/${photo.id}.jpg`, width: 80, height: 60, size: 400, sha256: 'a'.repeat(64) }),
    signDownload: async () => ({ url: 'https://private.test/signed', expiresIn: 60 }),
  }, { signUpload: async () => ({ url: 'https://files.test', fields: {} }), verify: async () => {}, signDownload: async () => ({ url: 'https://files.test/signed', expiresIn: 60 }) })
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
  it('requires organization ownership, completion and attachment for private photos', async () => {
    const input = { organizationId, contentType: 'image/jpeg' as const, size: 500, requestId: randomUUID() }
    await expect(repository.execute(member, { operation: 'photoUpload', organizationId, input })).rejects.toMatchObject({ status: 403 })
    const uploaded = await repository.execute(owner, { operation: 'photoUpload', organizationId, input }) as { photoId: string }
    expect(await repository.execute(owner, { operation: 'photoUpload', organizationId, input })).toMatchObject({ photoId: uploaded.photoId })
    const item = await equipment()
    await expect(repository.execute(owner, { operation: 'updateEquipment', organizationId, itemId: item.id, input: { photoId: uploaded.photoId } })).rejects.toMatchObject({ status: 409 })
    expect(await repository.execute(owner, { operation: 'completePhoto', organizationId, photoId: uploaded.photoId })).toMatchObject({ photoId: uploaded.photoId, width: 80 })
    expect(await repository.execute(owner, { operation: 'updateEquipment', organizationId, itemId: item.id, input: { photoId: uploaded.photoId } })).toMatchObject({ photoId: uploaded.photoId })
    expect(await repository.execute(member, { operation: 'downloadPhoto', organizationId, itemId: item.id })).toMatchObject({ photoId: uploaded.photoId, expiresIn: 60 })
    await expect(repository.execute(outsider, { operation: 'downloadPhoto', organizationId, itemId: item.id })).rejects.toMatchObject({ status: 403 })
    const second = await equipment()
    await expect(repository.execute(owner, { operation: 'updateEquipment', organizationId, itemId: second.id, input: { photoId: uploaded.photoId } })).rejects.toMatchObject({ status: 409 })
    await repository.execute(owner, { operation: 'updateEquipment', organizationId, itemId: item.id, input: { photoId: null } })
    await expect(repository.execute(member, { operation: 'downloadPhoto', organizationId, itemId: item.id })).rejects.toMatchObject({ status: 404 })
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
  it('does not grant schema migration, hard-deletion or identity-rewrite permissions to runtime', async () => {
    const connection = new pg.Client({ connectionString })
    try {
      await connection.connect(); await connection.query('SET ROLE "studiostack_dev_app"')
      for (const sql of ['CREATE TABLE app.forbidden (id int)', 'UPDATE app.organization_memberships SET user_id = user_id', 'DELETE FROM app.inventory']) {
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
  function production(identity: Identity, input: Omit<ProductionRequest, 'operation' | 'organizationId' | 'page'> & Partial<Pick<ProductionRequest,'organizationId'|'page'>>) {
    return repository.execute(identity,{ operation:'production',organizationId,page:listPage,...input })
  }
  async function draft() {
    const data = { ...emptyBrief(), projectName:'Example shoot', client:'Example client',managers:'Account manager',deliveryDate:new Date(Date.now()+30*86400_000).toISOString().slice(0,10), productionTypes:['Videography' as const],fields:{ summary:'Film an interview.',objective:'Introduce the program.',audience:'Students',platform:'YouTube',deliverables:'One interview film.',location:'Campus',shootEstimate:'Next week',proposedStart:new Date(Date.now()+7*86400_000).toISOString().slice(0,10),proposedEnd:new Date(Date.now()+7*86400_000).toISOString().slice(0,10) } }
    return await production(member,{resource:'briefs',method:'POST',body:{data,requestId:randomUUID()}}) as ProductionBrief
  }
  async function command(identity:Identity,b:ProductionBrief,action:BriefCommand['action'],comment='') {
    return await production(identity,{resource:'actions',method:'POST',briefId:b.id,body:{action,version:b.version,requestId:randomUUID(),comment}}) as ProductionBrief
  }
  it('production: only admins assign active reviewers and ELT memberships',async()=>{
    const settings = {version:0,reviewerIds:[profiles[secondMember.subject].id],executiveIds:[],approvalConfirmsDates:true}
    await expect(production(member,{resource:'settings',method:'PATCH',body:settings})).rejects.toMatchObject({status:403})
    await expect(production(owner,{resource:'settings',method:'PATCH',body:{...settings,reviewerIds:[profiles.outsider.id]}})).rejects.toMatchObject({status:400})
    expect(await production(owner,{resource:'settings',method:'PATCH',body:settings})).toMatchObject({version:1})
    await expect(production(owner,{resource:'settings',method:'PATCH',body:settings})).rejects.toMatchObject({status:409})
    expect(await production(secondMember,{resource:'access',method:'GET'})).toMatchObject({canReview:true,canAdminister:false})
    expect(await production(owner,{resource:'access',method:'GET'})).toMatchObject({canReview:false,canAdminister:true})
  })
  it('production: persists drafts, hides them from reviewers, and enforces tenant membership',async()=>{
    const b=await draft()
    expect(await production(member,{resource:'briefs',method:'GET',briefId:b.id})).toMatchObject({data:{projectName:'Example shoot'},version:1})
    await expect(production(secondMember,{resource:'briefs',method:'GET',briefId:b.id})).rejects.toMatchObject({status:404})
    await expect(production(outsider,{resource:'briefs',method:'GET',briefId:b.id})).rejects.toMatchObject({status:403})
    await expect(production(outsider,{resource:'briefs',method:'GET',briefId:b.id,organizationId:otherOrganizationId})).rejects.toMatchObject({status:404})
  })
  it('production: validates submission and preserves an immutable submission snapshot',async()=>{
    let b=await draft()
    const missing={...b.data,client:''}
    b=await production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{data:missing,version:b.version,requestId:randomUUID()}}) as ProductionBrief
    await expect(command(member,b,'submit')).rejects.toMatchObject({status:400})
    b=await production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{data:{...missing,client:'Restored client'},version:b.version,requestId:randomUUID()}}) as ProductionBrief
    b=await command(member,b,'submit')
    expect(b.status).toBe('submitted');expect(b.events.at(-1)?.snapshot?.client).toBe('Restored client')
    await expect(production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{data:b.data,version:b.version,requestId:randomUUID()}})).rejects.toMatchObject({status:403})
    const changed=await command(secondMember,b,'request_changes','Add more detail to the deliverables.')
    const saved=await production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{data:{...changed.data,client:'New client'},version:changed.version,requestId:randomUUID()}}) as ProductionBrief
    expect(saved.events.find(e=>e.kind==='submitted')?.snapshot?.client).toBe('Restored client')
    const resubmitted=await command(member,saved,'submit');expect(resubmitted.submission).toBe(2)
  })
  it('production: approval confirms shoot dates, records the reviewer, and enqueues exactly one email',async()=>{
    const b=await command(member,await draft(),'submit'),body={action:'approve',version:b.version,requestId:randomUUID()}
    await expect(production(member,{resource:'actions',method:'POST',briefId:b.id,body})).rejects.toMatchObject({status:403})
    const approved=await production(secondMember,{resource:'actions',method:'POST',briefId:b.id,body}) as ProductionBrief
    expect(approved.status).toBe('approved');expect(approved.shootStartsAt).toBeTruthy()
    expect(approved.events.at(-1)).toMatchObject({kind:'approved',actorId:profiles[secondMember.subject].id})
    expect(await production(secondMember,{resource:'actions',method:'POST',briefId:b.id,body})).toMatchObject({id:b.id,version:approved.version})
    const jobs=await operator.query('SELECT payload FROM app.production_outbox WHERE brief_id=$1',[b.id]);expect(jobs.rows).toHaveLength(1);expect(jobs.rows[0].payload).toMatchObject({reviewer:'second-member',decision:'approved'})
  })
  it('production: only one concurrent leadership decision can succeed',async()=>{
    const b=await command(member,await draft(),'submit')
    const results=await Promise.allSettled([command(secondMember,b,'approve'),command(secondMember,b,'deny','Scope is not feasible.')])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    expect(results.filter(r=>r.status==='rejected')).toEqual([expect.objectContaining({reason:expect.objectContaining({status:409})})])
    expect((await operator.query('SELECT id FROM app.production_outbox WHERE brief_id=$1',[b.id])).rows).toHaveLength(1)
  })
  it('production: month-only estimates need concrete dates at approval',async()=>{
    let b=await draft();const data={...b.data,fields:{...b.data.fields,proposedStart:'',proposedEnd:'',shootEstimate:'November'}}
    b=await production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{data,version:b.version,requestId:randomUUID()}}) as ProductionBrief;b=await command(member,b,'submit')
    await expect(command(secondMember,b,'approve')).rejects.toMatchObject({status:400})
    const start=new Date(Date.now()+86400_000).toISOString(),end=new Date(Date.now()+2*86400_000).toISOString()
    expect(await production(secondMember,{resource:'actions',method:'POST',briefId:b.id,body:{action:'approve',version:b.version,requestId:randomUUID(),shootStartsAt:start,shootEndsAt:end}})).toMatchObject({status:'approved'})
  })
  it('production: stale saves fail, retries deduplicate, and changed request IDs conflict',async()=>{
    const b=await draft(),body={data:{...b.data,projectName:'Changed name'},version:b.version,requestId:randomUUID()}
    const saved=await production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body}) as ProductionBrief
    expect(await production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body})).toMatchObject({version:saved.version})
    await expect(production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{...body,requestId:randomUUID()}})).rejects.toMatchObject({status:409})
    await expect(production(member,{resource:'briefs',method:'PATCH',briefId:b.id,body:{...body,data:b.data}})).rejects.toMatchObject({status:409})
  })
  it('production: withdrawing removes confirmation; reopening retains history',async()=>{
    const b=await command(secondMember,await command(member,await draft(),'submit'),'approve')
    const withdrawn=await command(member,b,'withdraw');expect(withdrawn.status).toBe('withdrawn');expect(withdrawn.shootStartsAt).toBeNull()
    expect(await command(member,withdrawn,'reopen')).toMatchObject({status:'draft',submission:1})
  })
  it('production: attachment completion is owner-scoped and blocks premature submission',async()=>{
    let b=await draft();const attachmentId=randomUUID(),body={id:attachmentId,name:'Reference.pdf',contentType:'application/pdf',size:120}
    expect(await production(member,{resource:'attachments',method:'POST',briefId:b.id,body})).toMatchObject({id:attachmentId})
    await expect(command(member,b,'submit')).rejects.toMatchObject({status:409})
    b=await production(member,{resource:'attachments',method:'POST',briefId:b.id,attachmentId,body:{}}) as ProductionBrief;expect(b).toMatchObject({attachments:[expect.objectContaining({status:'ready'})]})
    await command(member,b,'submit')
    expect(await production(secondMember,{resource:'attachments',method:'GET',briefId:b.id,attachmentId})).toMatchObject({expiresIn:60})
    await expect(production(secondMember,{resource:'attachments',method:'POST',briefId:b.id,attachmentId,body:{}})).rejects.toMatchObject({status:403})
  })
  it('production: queue leasing avoids duplicate claims and acknowledges only the current lease',async()=>{
    const connect=async()=>{const c=new pg.Client({connectionString});await c.connect();await c.query('SET ROLE "studiostack_dev_app"');return c}
    const a=await connect(),b=await connect()
    try {
      const [one,two]=await Promise.all([outboxTask(a,{action:'claim'}),outboxTask(b,{action:'claim'})]);const ids=[...(one.jobs??[]),...(two.jobs??[])].map(j=>j.id)
      expect(new Set(ids).size).toBe(ids.length)
      const job=one.jobs?.[0]??two.jobs?.[0];expect(job).toBeTruthy()
      expect(await outboxTask(a,{action:'ack',organizationId:job!.organizationId,id:job!.id,leaseToken:randomUUID(),outcome:'sent'})).toEqual({updated:false})
      expect(await outboxTask(a,{action:'ack',organizationId:job!.organizationId,id:job!.id,leaseToken:job!.leaseToken,outcome:'sent'})).toEqual({updated:true})
      expect(await outboxTask(a,{action:'ack',organizationId:job!.organizationId,id:job!.id,leaseToken:job!.leaseToken,outcome:'sent'})).toEqual({updated:false})
    } finally {await a.end();await b.end()}
  })
  it('production: database row security and append-only grants protect decision history',async()=>{
    const c=new pg.Client({connectionString});try {await c.connect();await c.query('SET ROLE "studiostack_dev_app"');expect((await c.query('SELECT id FROM app.production_briefs')).rows).toEqual([])
      for(const sql of ['UPDATE app.production_brief_events SET comment=\'tampered\'','DELETE FROM app.production_briefs','DELETE FROM app.production_outbox']) await expect(c.query(sql)).rejects.toMatchObject({code:'42501'})
    }finally{await c.end()}
  })

  function account<T>(identity:Identity,input:Omit<AccountRequest,'operation'|'organizationId'|'page'>&Partial<Pick<AccountRequest,'organizationId'>>) {
    return repository.execute(identity,{operation:'accounts',organizationId,page:listPage,...input}) as Promise<T>
  }
  async function accountMember(identity:Identity) {
    return (await account<ApiPage<ManagedMember>>(owner,{resource:'members',method:'GET'})).items.find(m=>m.id===profiles[identity.subject].id)!
  }
  it('accounts: members cannot administer people, teams or settings and foreign targets remain isolated',async()=>{
    await expect(account(member,{resource:'members',method:'GET'})).rejects.toMatchObject({status:403})
    await expect(account(member,{resource:'members',method:'PATCH',memberId:profiles.member.id,body:{role:'owner',status:'active',version:1,requestId:randomUUID()}})).rejects.toMatchObject({status:403})
    await expect(account(owner,{resource:'members',method:'PATCH',organizationId:otherOrganizationId,memberId:profiles.outsider.id,body:{role:'owner',status:'active',version:1,requestId:randomUUID()}})).rejects.toMatchObject({status:403})
    await expect(account(owner,{resource:'members',method:'PATCH',memberId:profiles.outsider.id,body:{role:'owner',status:'active',version:1,requestId:randomUUID()}})).rejects.toMatchObject({status:404})
    expect(await account<OrganizationSettings>(member,{resource:'settings',method:'GET'})).toMatchObject({name:'Test Org',role:'member'})
  })
  it('accounts: the final active owner cannot be demoted or suspended',async()=>{
    const m=await accountMember(owner)
    for(const changes of [{role:'member',status:'active'},{role:'owner',status:'suspended'}])await expect(account(owner,{resource:'members',method:'PATCH',memberId:m.id,body:{...changes,version:m.version,requestId:randomUUID()}})).rejects.toMatchObject({status:409})
    expect(await accountMember(owner)).toMatchObject({role:'owner',status:'active',version:m.version})
  })
  it('accounts: role changes are versioned, idempotent and cannot be escalated by administrators',async()=>{
    const target=await accountMember(secondMember),requestId=randomUUID(),body={role:'admin',status:'active',version:target.version,requestId}
    const updated=await account<ManagedMember>(owner,{resource:'members',method:'PATCH',memberId:target.id,body})
    expect(updated.role).toBe('admin');expect(updated.version).toBe(target.version+1)
    expect(await account(owner,{resource:'members',method:'PATCH',memberId:target.id,body})).toMatchObject({version:updated.version})
    await expect(account(owner,{resource:'members',method:'PATCH',memberId:target.id,body:{...body,requestId:randomUUID()}})).rejects.toMatchObject({status:409})
    const m=await accountMember(member)
    await expect(account(secondMember,{resource:'members',method:'PATCH',memberId:m.id,body:{role:'owner',status:'active',version:m.version,requestId:randomUUID()}})).rejects.toMatchObject({status:403})
    const suspendedMember=await account<ManagedMember>(secondMember,{resource:'members',method:'PATCH',memberId:m.id,body:{role:'member',status:'suspended',version:m.version,requestId:randomUUID()}})
    await expect(account(member,{resource:'settings',method:'GET'})).rejects.toMatchObject({status:403})
    await account(secondMember,{resource:'members',method:'PATCH',memberId:m.id,body:{role:'member',status:'active',version:suspendedMember.version,requestId:randomUUID()}})
    await account(owner,{resource:'members',method:'PATCH',memberId:target.id,body:{role:'member',status:'active',version:updated.version,requestId:randomUUID()}})
    expect((await operator.query('SELECT id FROM app.organization_audit_events WHERE request_id=$1',[requestId])).rows).toHaveLength(1)
  })
  it('accounts: team membership updates reject foreign users and archival preserves team history',async()=>{
    const requestId=randomUUID(),team=await account<ManagedTeam>(owner,{resource:'teams',method:'POST',body:{name:'Production team',requestId}})
    expect(await account(owner,{resource:'teams',method:'POST',body:{name:'Production team',requestId}})).toMatchObject({id:team.id})
    const body={name:team.name,archived:false,memberIds:[profiles.member.id],version:team.version,requestId:randomUUID()}
    await expect(account(owner,{resource:'teams',method:'PATCH',teamId:team.id,body:{...body,memberIds:[profiles.outsider.id]}})).rejects.toMatchObject({status:400})
    const updated=await account<ManagedTeam>(owner,{resource:'teams',method:'PATCH',teamId:team.id,body})
    expect(updated.memberIds).toEqual([profiles.member.id])
    const archived=await account<ManagedTeam>(owner,{resource:'teams',method:'PATCH',teamId:team.id,body:{...body,archived:true,version:updated.version,requestId:randomUUID()}})
    expect(archived.archivedAt).toBeTruthy()
    expect((await repository.execute(member,{operation:'groups',organizationId,page:listPage}) as ApiPage<ManagedTeam>).items.some(t=>t.id===team.id)).toBe(false)
    expect((await account<ApiPage<ManagedTeam>>(owner,{resource:'teams',method:'GET'})).items.find(t=>t.id===team.id)?.memberIds).toEqual([profiles.member.id])
  })
  it('accounts: organization policies use optimistic versions and retain an append-only audit',async()=>{
    const current=await account<OrganizationSettings>(owner,{resource:'settings',method:'GET'}),body={name:'Renamed studio',reservationDays:14,version:current.version,requestId:randomUUID()}
    expect(await account(owner,{resource:'settings',method:'PATCH',body})).toMatchObject({name:body.name,reservationDays:14,version:current.version+1})
    await expect(account(owner,{resource:'settings',method:'PATCH',body:{...body,requestId:randomUUID()}})).rejects.toMatchObject({status:409})
    const activity=await account<ApiPage<{id:string}>>(owner,{resource:'activity',method:'GET'});expect(activity.items.length).toBeGreaterThan(0)
    await expect(account(member,{resource:'activity',method:'GET'})).rejects.toMatchObject({status:403})
    const c=new pg.Client({connectionString});try{await c.connect();await c.query('SET ROLE "studiostack_dev_app"');for(const sql of ['UPDATE app.organization_audit_events SET details=\'{}\'','DELETE FROM app.organization_audit_events'])await expect(c.query(sql)).rejects.toMatchObject({code:'42501'})}finally{await c.end()}
  })
  it('accounts: concurrent owner demotions leave an active owner',async()=>{
    const a=await accountMember(owner),b=await accountMember(secondMember)
    const promoted=await account<ManagedMember>(owner,{resource:'members',method:'PATCH',memberId:b.id,body:{role:'owner',status:'active',version:b.version,requestId:randomUUID()}})
    const result=await Promise.allSettled([account(owner,{resource:'members',method:'PATCH',memberId:a.id,body:{role:'member',status:'active',version:a.version,requestId:randomUUID()}}),account(secondMember,{resource:'members',method:'PATCH',memberId:b.id,body:{role:'member',status:'active',version:promoted.version,requestId:randomUUID()}})])
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1)
    const owners=(await operator.query("SELECT user_id FROM app.organization_memberships WHERE organization_id=$1 AND role='owner' AND status='active'",[organizationId])).rows;expect(owners).toHaveLength(1)
    const actor=owners[0].user_id===a.id?owner:secondMember
    if(actor!==owner){const m=(await account<ApiPage<ManagedMember>>(actor,{resource:'members',method:'GET'})).items.find(m=>m.id===a.id)!;await account(actor,{resource:'members',method:'PATCH',memberId:a.id,body:{role:'owner',status:'active',version:m.version,requestId:randomUUID()}})}
    const last=await accountMember(secondMember);if(last.role==='owner')await account(owner,{resource:'members',method:'PATCH',memberId:last.id,body:{role:'member',status:'active',version:last.version,requestId:randomUUID()}})
  })
  async function directory(request:DirectoryRequest) {
    const c=new pg.Client({connectionString});try{await c.connect();await c.query('SET ROLE "studiostack_dev_app"');return await directoryTask(c,request)}finally{await c.end()}
  }
  async function invitation(email=`${randomUUID()}@example.org`,role:'member'|'admin'='member') {
    return account<OrganizationInvitation>(owner,{resource:'invitations',method:'POST',body:{email,displayName:'Invited person',role,requestId:randomUUID()}})
  }
  it('invitations: creation is authorized, idempotent, and owner-only for administrator invitations',async()=>{
    const body={email:`${randomUUID()}@example.org`,displayName:'New teammate',role:'member',requestId:randomUUID()}
    await expect(account(member,{resource:'invitations',method:'POST',body})).rejects.toMatchObject({status:403})
    const created=await account<OrganizationInvitation>(owner,{resource:'invitations',method:'POST',body})
    expect(created).toMatchObject({status:'pending',deliveryStatus:'queued',role:'member',version:1})
    expect(await account(owner,{resource:'invitations',method:'POST',body})).toMatchObject({id:created.id,version:1})
    await expect(account(owner,{resource:'invitations',method:'POST',body:{...body,role:'admin'}})).rejects.toMatchObject({status:409})
    const m=await accountMember(secondMember),admin=await account<ManagedMember>(owner,{resource:'members',method:'PATCH',memberId:m.id,body:{role:'admin',status:'active',version:m.version,requestId:randomUUID()}})
    await expect(account(secondMember,{resource:'invitations',method:'POST',body:{...body,email:'another@example.org',role:'admin',requestId:randomUUID()}})).rejects.toMatchObject({status:403})
    await account(owner,{resource:'members',method:'PATCH',memberId:m.id,body:{role:'member',status:'active',version:admin.version,requestId:randomUUID()}})
  })
  it('invitations: only the verified recipient can accept; membership and audit commit once',async()=>{
    const identity={issuer,subject:randomUUID(),email:`${randomUUID()}@example.org`}
    await repository.execute(identity,{operation:'register',displayName:'Invite recipient'})
    const created=await invitation(identity.email,'admin')
    expect(await directory({action:'accept',identity:{...identity,email:'wrong@example.org'},organizationId,invitationId:created.id})).toMatchObject({statusCode:404})
    expect(await directory({action:'list',identity})).toMatchObject({items:[expect.objectContaining({id:created.id,organizationId})]})
    const request={action:'accept' as const,identity,organizationId,invitationId:created.id}
    expect(await directory(request)).toEqual({organizationId});expect(await directory(request)).toEqual({organizationId})
    expect(await repository.execute(identity,{operation:'organizations',page:listPage})).toMatchObject({items:[expect.objectContaining({role:'admin',id:organizationId})]})
    expect((await operator.query("SELECT id FROM app.organization_audit_events WHERE target_id=$1 AND kind='invitation_accepted'",[created.id])).rows).toHaveLength(1)
  })
  it('invitations: revoked and expired invitations cannot grant access; retry is versioned',async()=>{
    const identity={issuer,subject:randomUUID(),email:`${randomUUID()}@example.org`};await repository.execute(identity,{operation:'register',displayName:'Recipient'})
    const revoked=await invitation(identity.email)
    await expect(account(owner,{resource:'invitations',method:'POST',invitationId:revoked.id,action:'retry',body:{version:revoked.version,requestId:randomUUID()}})).rejects.toMatchObject({status:409})
    await operator.query("UPDATE app.organization_invitations SET delivery_status='uncertain' WHERE id=$1",[revoked.id])
    const retried=await account<OrganizationInvitation>(owner,{resource:'invitations',method:'POST',invitationId:revoked.id,action:'retry',body:{version:revoked.version,requestId:randomUUID()}})
    expect(retried).toMatchObject({version:2,deliveryStatus:'queued'})
    await account(owner,{resource:'invitations',method:'POST',invitationId:revoked.id,action:'revoke',body:{version:retried.version,requestId:randomUUID()}})
    expect(await directory({action:'accept',identity,organizationId,invitationId:revoked.id})).toMatchObject({statusCode:404})
    const expired=await invitation(identity.email)
    await operator.query("UPDATE app.organization_invitations SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",[expired.id])
    expect(await directory({action:'accept',identity,organizationId,invitationId:expired.id})).toMatchObject({statusCode:404})
  })
  it('invitations: acceptance preserves existing roles and never restores a suspended member',async()=>{
    const identity={issuer,subject:randomUUID(),email:`${randomUUID()}@example.org`},profile=await repository.execute(identity,{operation:'register',displayName:'Existing person'}) as ApiUser
    const created=await invitation(identity.email)
    await operator.query("INSERT INTO app.organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'admin','active')",[organizationId,profile.id])
    expect(await directory({action:'accept',identity,organizationId,invitationId:created.id})).toEqual({organizationId})
    expect((await repository.execute(identity,{operation:'organizations',page:listPage}) as ApiPage<ApiOrganization>).items[0].role).toBe('admin')
    const nextIdentity={issuer,subject:randomUUID(),email:`${randomUUID()}@example.org`},next=await repository.execute(nextIdentity,{operation:'register',displayName:'Suspended person'}) as ApiUser
    const pending=await invitation(nextIdentity.email)
    await operator.query("INSERT INTO app.organization_memberships(organization_id,user_id,role,status) VALUES($1,$2,'member','suspended')",[organizationId,next.id])
    expect(await directory({action:'accept',identity:nextIdentity,organizationId,invitationId:pending.id})).toMatchObject({statusCode:409})
  })
  it('invitations: concurrent workers claim unique jobs and acknowledge only the current lease',async()=>{
    async function queue(request:InvitationQueueRequest){const c=new pg.Client({connectionString});try{await c.connect();await c.query('SET ROLE "studiostack_dev_app"');return await invitationQueueTask(c,request)}finally{await c.end()}}
    await invitation()
    const [one,two]=await Promise.all([queue({action:'claim'}),queue({action:'claim'})]),jobs=[...('jobs'in one?one.jobs??[]:[]),...('jobs'in two?two.jobs??[]:[])]
    expect(new Set(jobs.map(j=>j.id)).size).toBe(jobs.length);expect(jobs.length).toBeGreaterThan(0)
    const job=jobs[0],ack={action:'ack' as const,organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome:'sent' as const}
    expect(await queue({...ack,leaseToken:randomUUID()})).toEqual({updated:false})
    expect(await queue(ack)).toEqual({updated:true});expect(await queue(ack)).toEqual({updated:false})
  })
  it('equipment schema: a returned reservation must have a real return timestamp',async()=>{
    const item=await equipment(),reservation=await repository.execute(member,{operation:'createReservation',organizationId,input:booking(item)}) as ApiReservation
    await expect(operator.query("UPDATE app.reservations SET fulfillment_status='returned',checked_out_at=now(),returned_at=NULL WHERE id=$1",[reservation.id])).rejects.toMatchObject({code:'23514'})
  })

  function workflow<T=EquipmentReservation>(actor:Identity,reservationId:string,resource:string,body?:unknown,method='POST',query:Record<string,string>={}){return repository.execute(actor,{operation:'equipment',organizationId,reservationId,resource,method,body,query} as EquipmentRequest) as Promise<T>}
  async function nearBooking(item:ApiEquipment,actor=member){const start=new Date(Date.now()+5*60000).toISOString();return await repository.execute(actor,{operation:'createReservation',organizationId,input:{...booking(item),startsAt:start,endsAt:new Date(Date.parse(start)+3600000).toISOString()}}) as EquipmentReservation}
  it('equipment: checkout is owner-scoped, durable, idempotent and prevents cancellation',async()=>{
    const item=await equipment(),r=await nearBooking(item),body={version:r.version,requestId:randomUUID(),conditions:[{equipmentId:item.id,condition:'good',notes:'Ready'}]}
    await expect(workflow(secondMember,r.id,'checkout',body)).rejects.toMatchObject({status:404})
    const out=await workflow(member,r.id,'checkout',body);expect(out).toMatchObject({fulfillmentStatus:'checked_out',version:r.version+1});expect(out.checkedOutAt).toBeTruthy()
    expect(await workflow(member,r.id,'checkout',body)).toMatchObject({version:out.version})
    expect((await operator.query('SELECT id FROM app.equipment_checkouts WHERE reservation_id=$1',[r.id])).rows).toHaveLength(1)
    await expect(repository.execute(member,{operation:'cancelReservation',organizationId,reservationId:r.id})).rejects.toMatchObject({status:409})
    await expect(workflow(outsider,r.id,'checkout',body)).rejects.toMatchObject({status:403})
  })
  it('equipment: a damaged return creates one report and takes the item out of service atomically',async()=>{
    const item=await equipment(),r=await nearBooking(item),out=await workflow(member,r.id,'checkout',{version:r.version,requestId:randomUUID(),conditions:[{equipmentId:item.id,condition:'good'}]})
    await expect(workflow(member,r.id,'return',{version:out.version,requestId:randomUUID(),conditions:[{equipmentId:randomUUID(),condition:'damaged'}]})).rejects.toMatchObject({status:400})
    const body={version:out.version,requestId:randomUUID(),conditions:[{equipmentId:item.id,condition:'damaged',notes:'Broken mount during shoot.'}]},returned=await workflow(member,r.id,'return',body)
    expect(returned).toMatchObject({fulfillmentStatus:'returned',version:out.version+1});expect(returned.returnedAt).toBeTruthy()
    expect(await workflow(member,r.id,'return',body)).toMatchObject({version:returned.version})
    expect((await operator.query('SELECT status,condition FROM app.inventory WHERE id=$1',[item.id])).rows[0]).toEqual({status:'maintenance',condition:'damaged'})
    const reports=(await operator.query<EquipmentReport>('SELECT id,title,description FROM app.equipment_reports WHERE reservation_id=$1',[r.id])).rows;expect(reports).toHaveLength(1);expect(reports[0].description).toContain('Broken mount')
    expect((await operator.query('SELECT returned_at FROM app.equipment_checkouts WHERE reservation_id=$1',[r.id])).rows[0].returned_at).toBeTruthy()
  })
  it('equipment: overdue physical checkout prevents another borrower taking the same item',async()=>{
    const item=await equipment(),r=await nearBooking(item);await workflow(member,r.id,'checkout',{version:r.version,requestId:randomUUID(),conditions:[{equipmentId:item.id,condition:'good'}]})
    await operator.query("UPDATE app.reservations SET starts_at=now()-interval '1 hour',ends_at=now()-interval '1 second' WHERE id=$1",[r.id])
    const next=await nearBooking(item,secondMember)
    await expect(workflow(secondMember,next.id,'checkout',{version:next.version,requestId:randomUUID(),conditions:[{equipmentId:item.id,condition:'good'}]})).rejects.toMatchObject({status:409})
  })
  it('equipment: edits and extensions preserve versions and reject conflicting bookings',async()=>{
    const item=await equipment(),r=await repository.execute(member,{operation:'createReservation',organizationId,input:booking(item)}) as EquipmentReservation
    const start=new Date(Date.parse(endsAt)+3600000).toISOString();await repository.execute(secondMember,{operation:'createReservation',organizationId,input:{...booking(item),startsAt:start,endsAt:new Date(Date.parse(start)+3600000).toISOString()}})
    const body={...booking(item),name:'Updated shoot',endsAt:new Date(Date.parse(endsAt)+1800000).toISOString(),version:r.version}
    const edited=await workflow(member,r.id,'{reservationId}',body,'PATCH');expect(edited).toMatchObject({name:'Updated shoot',version:r.version+1})
    expect(await workflow(member,r.id,'{reservationId}',body,'PATCH')).toMatchObject({version:edited.version})
    await expect(workflow(member,r.id,'{reservationId}',{...body,endsAt:new Date(Date.parse(start)+1800000).toISOString(),version:edited.version,requestId:randomUUID()},'PATCH')).rejects.toMatchObject({status:409})
    await expect(workflow(member,r.id,'{reservationId}',{...body,requestId:randomUUID()},'PATCH')).rejects.toMatchObject({status:409})
  })
  it('equipment: concurrent reservation edits cannot book the same free item twice',async()=>{
    const a=await equipment(),b=await equipment(),shared=await equipment(),r1=await repository.execute(member,{operation:'createReservation',organizationId,input:booking(a)}) as EquipmentReservation,r2=await repository.execute(secondMember,{operation:'createReservation',organizationId,input:booking(b)}) as EquipmentReservation
    const results=await Promise.allSettled([workflow(member,r1.id,'{reservationId}',{...booking(shared),version:r1.version},'PATCH'),workflow(secondMember,r2.id,'{reservationId}',{...booking(shared),version:r2.version},'PATCH')])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}})
  })
  it('equipment: availability hides project and borrower details from other members',async()=>{
    const item=await equipment(),r=await repository.execute(secondMember,{operation:'createReservation',organizationId,input:booking(item)}) as EquipmentReservation
    const page=await workflow<ApiPage<EquipmentAvailability>>(member,r.id,'availability',undefined,'GET',{startsAt,endsAt,limit:'100'}),row=page.items.find(row=>row.id===r.id)!
    expect(row.equipmentIds).toContain(item.id);expect(row).not.toHaveProperty('userId');expect(row).not.toHaveProperty('name')
    await expect(repository.execute(member,{operation:'reservation',organizationId,reservationId:r.id})).rejects.toMatchObject({status:404})
  })
  it('equipment: reservation creation respects the saved organization length policy',async()=>{
    const item=await equipment(),policy=(await operator.query('SELECT reservation_days FROM app.organizations WHERE id=$1',[organizationId])).rows[0]
    try{await operator.query('UPDATE app.organizations SET reservation_days=2 WHERE id=$1',[organizationId]);await expect(repository.execute(member,{operation:'createReservation',organizationId,input:{...booking(item),endsAt:new Date(Date.parse(startsAt)+3*86400000).toISOString()}})).rejects.toMatchObject({status:400})}finally{await operator.query('UPDATE app.organizations SET reservation_days=$2 WHERE id=$1',[organizationId,policy.reservation_days])}
  })

  function report<T=EquipmentReport>(actor:Identity,value:Partial<ReportRequest>){return repository.execute(actor,{operation:'reports',organizationId,method:'GET',activity:false,page:listPage,...value} as ReportRequest) as Promise<T>}
  async function issue(item:ApiEquipment,severity='high'){return report(member,{method:'POST',body:{equipmentId:item.id,title:'Equipment damage',description:'Mount needs inspection.',severity,requestId:randomUUID()}})}
  it('reports: creation is durable and idempotent and high-severity gear is quarantined',async()=>{
    const item=await equipment(),body={equipmentId:item.id,title:'Broken mount',description:'The camera mount is cracked.',severity:'high',requestId:randomUUID()},created=await report(member,{method:'POST',body})
    expect(created).toMatchObject({equipmentId:item.id,reportedBy:profiles.member.id,status:'open',version:1})
    expect(await report(member,{method:'POST',body})).toMatchObject({id:created.id})
    expect((await operator.query('SELECT status FROM app.inventory WHERE id=$1',[item.id])).rows[0].status).toBe('maintenance')
    expect((await report<ApiPage<EquipmentReport>>(secondMember,{})).items.some(r=>r.id===created.id)).toBe(true)
  })
  it('reports: tenant and reservation links do not disclose another borrower records',async()=>{
    const item=await equipment(),r=await repository.execute(secondMember,{operation:'createReservation',organizationId,input:booking(item)}) as EquipmentReservation
    await expect(report(member,{method:'POST',body:{equipmentId:item.id,reservationId:r.id,title:'Linked issue',description:'Something broke.',severity:'low',requestId:randomUUID()}})).rejects.toMatchObject({status:404})
    await expect(report(outsider,{method:'POST',body:{equipmentId:item.id,title:'Issue',description:'Foreign issue.',severity:'low',requestId:randomUUID()}})).rejects.toMatchObject({status:403})
    const foreign=await repository.execute(outsider,{operation:'createEquipment',organizationId:otherOrganizationId,input:{equipmentCode:'FOREIGN-REPORT',name:'Other studio camera',category:'Camera & Accessories'}}) as ApiEquipment
    const foreignIssue=await report(outsider,{organizationId:otherOrganizationId,method:'POST',body:{equipmentId:foreign.id,title:'Other studio issue',description:'Foreign issue.',severity:'low',requestId:randomUUID()}})
    await expect(report(owner,{reportId:foreignIssue.id})).rejects.toMatchObject({status:404})
  })
  it('reports: only administrators resolve, with versions, repair notes and explicit restoration',async()=>{
    const item=await equipment(),r=await issue(item),body={status:'resolved',resolution:'Replaced the mount and tested.',restoreService:true,condition:'good',version:r.version,requestId:randomUUID()}
    await expect(report(member,{method:'PATCH',reportId:r.id,body})).rejects.toMatchObject({status:403})
    await expect(report(owner,{method:'PATCH',reportId:r.id,body:{...body,resolution:''}})).rejects.toMatchObject({status:400})
    const resolved=await report(owner,{method:'PATCH',reportId:r.id,body});expect(resolved).toMatchObject({status:'resolved',version:2,resolvedBy:profiles.owner.id})
    expect(await report(owner,{method:'PATCH',reportId:r.id,body})).toMatchObject({version:2})
    expect((await operator.query('SELECT status,condition FROM app.inventory WHERE id=$1',[item.id])).rows[0]).toEqual({status:'available',condition:'good'})
    await expect(report(owner,{method:'PATCH',reportId:r.id,body:{...body,requestId:randomUUID()}})).rejects.toMatchObject({status:409})
  })
  it('reports: restoration waits until every high-severity issue is resolved and reopening quarantines again',async()=>{
    const item=await equipment(),a=await issue(item),b=await issue(item),body={status:'resolved',resolution:'Repaired.',restoreService:true,condition:'good',version:1,requestId:randomUUID()}
    await expect(report(owner,{method:'PATCH',reportId:a.id,body})).rejects.toMatchObject({status:409})
    await report(owner,{method:'PATCH',reportId:a.id,body:{...body,restoreService:false}})
    const resolved=await report(owner,{method:'PATCH',reportId:b.id,body:{...body,requestId:randomUUID()}})
    expect((await operator.query('SELECT status FROM app.inventory WHERE id=$1',[item.id])).rows[0].status).toBe('available')
    await report(owner,{method:'PATCH',reportId:b.id,body:{status:'open',resolution:'',restoreService:false,version:resolved.version,requestId:randomUUID()}})
    expect((await operator.query('SELECT status FROM app.inventory WHERE id=$1',[item.id])).rows[0].status).toBe('maintenance')
  })
  it('reports: collaboration comments are immutable and duplicate requests add only one event',async()=>{
    const item=await equipment(),r=await issue(item,'low'),body={message:'Inspected the mount.\nWaiting for a part.',requestId:randomUUID()},event=await report<{id:string;details:{message:string}}>(secondMember,{method:'POST',activity:true,reportId:r.id,body})
    expect(event.details.message).toBe(body.message);expect(await report(secondMember,{method:'POST',activity:true,reportId:r.id,body})).toMatchObject({id:event.id})
    const page=await report<ApiPage<{kind:string}>>(member,{activity:true,reportId:r.id});expect(page.items.filter(e=>e.kind==='report_comment')).toHaveLength(1)
    const c=new pg.Client({connectionString});try{await c.connect();await c.query('SET ROLE "studiostack_dev_app"');await expect(c.query('DELETE FROM app.equipment_events')).rejects.toMatchObject({code:'42501'})}finally{await c.end()}
  })
  it('reports: concurrent status changes cannot overwrite a newer resolution',async()=>{
    const item=await equipment(),r=await issue(item),body={status:'in_progress',resolution:'',restoreService:false,version:r.version,requestId:randomUUID()}
    const results=await Promise.allSettled([report(owner,{method:'PATCH',reportId:r.id,body}),report(owner,{method:'PATCH',reportId:r.id,body:{...body,status:'resolved',resolution:'Repaired.',requestId:randomUUID()}})])
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}})
  })

  it('alert schema: optional email defaults off; deduplication and leases are constrained',async()=>{
    const pref=await operator.query('INSERT INTO app.alert_preferences(organization_id,user_id) VALUES($1,$2) RETURNING equipment_email',[organizationId,profiles.owner.id]);expect(pref.rows[0].equipment_email).toBe(false)
    const args=[organizationId,profiles.owner.id,'report_update','Repair update','A repair changed.','/report-summary/?report='+randomUUID(),'schema-check']
    const sql='INSERT INTO app.user_alerts(organization_id,recipient_id,kind,title,message,target_path,dedupe_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email_status'
    const row=(await operator.query(sql,args)).rows[0];expect(row.email_status).toBe('skipped')
    await expect(operator.query(sql,args)).rejects.toMatchObject({code:'23505'})
    await expect(operator.query("UPDATE app.user_alerts SET email_status='sending' WHERE id=$1",[row.id])).rejects.toMatchObject({code:'23514'})
    await expect(operator.query(sql,[...args.slice(0,5),'https://external.invalid','bad-target'])).rejects.toMatchObject({code:'23514'})
    await operator.query('DELETE FROM app.user_alerts WHERE id=$1',[row.id]);await operator.query('DELETE FROM app.alert_preferences WHERE organization_id=$1 AND user_id=$2',[organizationId,profiles.owner.id])
  })

  function alerts<T=unknown>(identity:Identity,value:Partial<AlertRequest>={}){return repository.execute(identity,{operation:'alerts',organizationId,method:'GET',resource:'list',page:listPage,...value} as AlertRequest) as Promise<T>}
  it('alerts: report updates are private to recipients and read commands cannot target another member',async()=>{
    const item=await equipment(),r=await issue(item,'low')
    const own=await alerts<ApiPage<AppAlert>>(owner),notice=own.items.find(a=>a.targetPath.endsWith(r.id))!;expect(notice).toMatchObject({kind:'report_update',emailStatus:'skipped',readAt:null})
    expect((await alerts<ApiPage<AppAlert>>(secondMember)).items.some(a=>a.id===notice.id)).toBe(false)
    await expect(alerts(secondMember,{resource:'read',method:'POST',alertId:notice.id,body:{}})).rejects.toMatchObject({status:404})
    const read=await alerts<AppAlert>(owner,{resource:'read',method:'POST',alertId:notice.id,body:{}});expect(read.readAt).not.toBeNull();expect(await alerts(owner,{resource:'read',method:'POST',alertId:notice.id,body:{}})).toMatchObject({readAt:read.readAt})
    await expect(alerts(outsider)).rejects.toMatchObject({status:403})
  })
  it('alerts: optional email has versioned opt-in and turning it off cancels pending messages',async()=>{
    expect(await alerts(member,{resource:'preferences'})).toEqual({equipmentEmail:false,version:0})
    const pref=await alerts<AlertPreferences>(member,{resource:'preferences',method:'PATCH',body:{equipmentEmail:true,version:0}});expect(pref).toEqual({equipmentEmail:true,version:1})
    await expect(alerts(member,{resource:'preferences',method:'PATCH',body:{equipmentEmail:false,version:0}})).rejects.toMatchObject({status:409})
    const item=await equipment(),r=await issue(item,'low');await report(secondMember,{method:'POST',reportId:r.id,activity:true,body:{message:'Repair update',requestId:randomUUID()}})
    expect((await alerts<ApiPage<AppAlert>>(member)).items.find(a=>a.targetPath.endsWith(r.id))).toMatchObject({emailStatus:'pending'})
    await alerts(member,{resource:'preferences',method:'PATCH',body:{equipmentEmail:false,version:1}})
    expect((await alerts<ApiPage<AppAlert>>(member)).items.find(a=>a.targetPath.endsWith(r.id))).toMatchObject({emailStatus:'skipped'})
  })
  it('alerts: overdue checkouts and maintenance conflicts notify borrower and admins once',async()=>{
    const item=await equipment(),r=await repository.execute(member,{operation:'createReservation',organizationId,input:booking(item)}) as EquipmentReservation
    const older=await equipment(),old=await repository.execute(member,{operation:'createReservation',organizationId,input:booking(older)}) as EquipmentReservation
    await operator.query("UPDATE app.reservations SET starts_at=now()-interval '3 hours',ends_at=now()-interval '1 hour',fulfillment_status='checked_out',checked_out_at=now()-interval '2 hours' WHERE id=$1",[old.id])
    await issue(item,'high')
    const first=await alerts<ApiPage<AppAlert>>(member),second=await alerts<ApiPage<AppAlert>>(member)
    for(const id of [r.id,old.id])expect(first.items.filter(a=>a.targetPath.endsWith(id))).toHaveLength(1)
    expect(second.items.filter(a=>a.targetPath.endsWith(old.id))).toHaveLength(1)
    expect(first.items.find(a=>a.targetPath.endsWith(r.id))?.kind).toBe('reservation_conflict')
    expect(first.items.find(a=>a.targetPath.endsWith(old.id))?.kind).toBe('overdue_equipment')
    expect((await alerts<ApiPage<AppAlert>>(owner)).items.some(a=>a.targetPath.endsWith(old.id))).toBe(true)
    expect((await alerts<ApiPage<AppAlert>>(secondMember)).items.some(a=>a.targetPath.endsWith(old.id))).toBe(false)
  })

  async function alertQueue(r:AlertOutboxRequest){const c=new pg.Client({connectionString});try{await c.connect();await c.query('SET ROLE "studiostack_dev_app"');return await alertOutboxTask(c,r)}finally{await c.end()}}
  it('alerts: delivery claims once, validates current preferences and acknowledges only its lease',async()=>{
    await alerts(secondMember,{resource:'preferences',method:'PATCH',body:{equipmentEmail:true,version:0}})
    const item=await equipment(),r=await issue(item,'low');await report(secondMember,{method:'POST',reportId:r.id,activity:true,body:{message:'Inspecting.',requestId:randomUUID()}});await report(owner,{method:'POST',reportId:r.id,activity:true,body:{message:'Replacement ordered.',requestId:randomUUID()}})
    const results=await Promise.all([alertQueue({action:'claim'}),alertQueue({action:'claim'})]),jobs=results.flatMap(v=>v.jobs??[]);expect(jobs).toHaveLength(1)
    const job=jobs[0];expect(await alertQueue({action:'authorize',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken})).toEqual({allowed:true})
    expect(await alertQueue({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:randomUUID(),outcome:'sent'})).toEqual({updated:false})
    await alerts(secondMember,{resource:'preferences',method:'PATCH',body:{equipmentEmail:false,version:1}})
    expect(await alertQueue({action:'authorize',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken})).toEqual({allowed:false})
    expect(await alertQueue({action:'ack',organizationId:job.organizationId,id:job.id,leaseToken:job.leaseToken,outcome:'skipped'})).toEqual({updated:true})
  })
  it('alerts: expired leases become uncertain instead of sending duplicate messages',async()=>{
    await alerts(secondMember,{resource:'preferences',method:'PATCH',body:{equipmentEmail:true,version:2}})
    const item=await equipment(),r=await issue(item,'low');await report(secondMember,{method:'POST',reportId:r.id,activity:true,body:{message:'Tracking.',requestId:randomUUID()}});await report(owner,{method:'POST',reportId:r.id,activity:true,body:{message:'Repair booked.',requestId:randomUUID()}})
    const claimed=await alertQueue({action:'claim'}),job=claimed.jobs![0];expect(job).toBeDefined();await operator.query("UPDATE app.user_alerts SET lease_until=now()-interval '1 minute' WHERE id=$1",[job.id])
    expect((await alertQueue({action:'claim'})).jobs).toHaveLength(0);expect((await operator.query('SELECT email_status FROM app.user_alerts WHERE id=$1',[job.id])).rows[0].email_status).toBe('uncertain')
    await alerts(secondMember,{resource:'preferences',method:'PATCH',body:{equipmentEmail:false,version:3}})
  })

  it('email feedback schema: recipient hashes are constrained and events deduplicated',async()=>{
    const event=randomUUID(),hash='a'.repeat(64);await operator.query("INSERT INTO app.email_feedback_events(id,kind,receipt_hash) VALUES($1,'bounce',$2)",[event,hash])
    await expect(operator.query("INSERT INTO app.email_suppressions(email_hash,reason,event_id) VALUES('raw@address.test','bounce',$1)",[event])).rejects.toMatchObject({code:'23514'})
    await operator.query("INSERT INTO app.email_suppressions(email_hash,reason,event_id) VALUES($1,'bounce',$2)",[hash,event])
    await expect(operator.query("INSERT INTO app.email_feedback_events(id,kind,receipt_hash) VALUES($1,'bounce',$2)",[event,hash])).rejects.toMatchObject({code:'23505'})
    await operator.query('DELETE FROM app.email_suppressions WHERE event_id=$1',[event]);await operator.query('DELETE FROM app.email_feedback_events WHERE id=$1',[event])
  })

  async function feedback(r:FeedbackRequest){const c=new pg.Client({connectionString});try{await c.connect();await c.query('SET ROLE "studiostack_dev_app"');return await feedbackTask(c,r)}finally{await c.end()}}
  it('feedback: permanent suppression is durable, private and idempotent',async()=>{
    const input={action:'record' as const,id:randomUUID(),kind:'bounce' as const,hashes:[emailHash('bounce@test.invalid')]}
    expect(await feedback(input)).toEqual({recorded:true,suppressed:1});expect(await feedback(input)).toEqual({recorded:false,suppressed:0});expect(await feedback({action:'check',emailHash:input.hashes[0]})).toEqual({allowed:false})
    expect(await feedback({action:'check',emailHash:emailHash('different@test.invalid')})).toEqual({allowed:true})
    await expect(feedback({...input,kind:'complaint'})).rejects.toThrow('changed')
  })
  it('feedback: bounce before equipment acknowledgement preserves suppression',async()=>{
    const pref=await alerts<AlertPreferences>(secondMember,{resource:'preferences'});await alerts(secondMember,{resource:'preferences',method:'PATCH',body:{equipmentEmail:true,version:pref.version}})
    const id=randomUUID();await operator.query("INSERT INTO app.user_alerts(id,organization_id,recipient_id,kind,title,message,target_path,dedupe_key,email_status) VALUES($1,$2,$3,'report_update','Fixture','Fixture',$4,$5,'pending')",[id,organizationId,profiles['second-member'].id,'/report-summary/?report='+id,id])
    const job=(await alertQueue({action:'claim'})).jobs!.find(j=>j.id===id)!;expect(job).toBeDefined()
    await feedback({action:'record',id:randomUUID(),kind:'bounce',hashes:[emailHash('equipment@test.invalid')],deliveryId:id})
    expect(await alertQueue({action:'ack',organizationId,id,leaseToken:job.leaseToken,outcome:'sent'})).toEqual({updated:true})
    expect((await operator.query('SELECT email_status FROM app.user_alerts WHERE id=$1',[id])).rows[0].email_status).toBe('suppressed')
    const current=await alerts<AlertPreferences>(secondMember,{resource:'preferences'});await alerts(secondMember,{resource:'preferences',method:'PATCH',body:{equipmentEmail:false,version:current.version}})
  })

  it('feedback: simultaneous provider events and acknowledgements always retain suppression',async()=>{
    for(let attempt=0;attempt<5;attempt++){
      const id=randomUUID(),leaseToken=randomUUID();await operator.query("INSERT INTO app.user_alerts(id,organization_id,recipient_id,kind,title,message,target_path,dedupe_key,email_status,lease_token,lease_until) VALUES($1,$2,$3,'report_update','Race fixture','Fixture',$4,$5,'sending',$6,now()+interval '5 minutes')",[id,organizationId,profiles.owner.id,'/report-summary/?report='+id,id,leaseToken])
      await Promise.all([feedback({action:'record',id:randomUUID(),kind:'complaint',hashes:[emailHash(id+'@test.invalid')],deliveryId:id}),alertQueue({action:'ack',organizationId,id,leaseToken,outcome:'sent'})])
      expect((await operator.query('SELECT email_status FROM app.user_alerts WHERE id=$1',[id])).rows[0].email_status).toBe('suppressed')
    }
  })

})
