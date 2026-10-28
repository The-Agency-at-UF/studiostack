// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabaseApiClient } from './database'

afterEach(()=>vi.useRealTimers())

describe('authenticated database browser client', () => {
  it.each(['http://example.com', 'https://user:password@example.com', 'https://example.com?token=private', 'https://example.com#token'])('rejects unsafe URLs %s', baseUrl => {
    expect(() => createDatabaseApiClient({ baseUrl, getAccessToken: vi.fn() })).toThrow()
  })
  it('gets a real token for each request and never sends cookies or retries writes', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('real.token'), fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'profile' }) })
    const client = createDatabaseApiClient({ baseUrl: 'https://example.com', getAccessToken, fetch: fetcher })
    await client.register('Name')
    expect(fetcher).toHaveBeenCalledWith('https://example.com/me', expect.objectContaining({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer real.token', 'Content-Type': 'application/json' }, body: '{"displayName":"Name"}' }))
    expect(fetcher).toHaveBeenCalledTimes(1)
    await client.me()
    expect(getAccessToken).toHaveBeenCalledTimes(2)
  })
  it('refuses an empty token before any network call', async () => {
    const fetcher = vi.fn(), client = createDatabaseApiClient({ baseUrl: 'https://example.com', getAccessToken: async () => '', fetch: fetcher })
    await expect(client.me()).rejects.toThrow('real access token')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not leak response details and does not replay a failed booking', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ private: 'SECRET' }) })
    const client = createDatabaseApiClient({ baseUrl: 'https://example.com', getAccessToken: async () => 'token', fetch: fetcher })
    await expect(client.cancelReservation('org', 'reservation')).rejects.toMatchObject({ status: 409 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('encodes path components and bounded list options', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) })
    const client = createDatabaseApiClient({ baseUrl: 'https://example.com/dev/', getAccessToken: async () => 'token', fetch: fetcher })
    await client.inventory('org/id', { limit: 10, after: 'cursor' })
    expect(fetcher.mock.calls[0][0]).toBe('https://example.com/dev/organizations/org%2Fid/inventory?limit=10&after=cursor')
  })
  it('backs off transient reads without retrying writes',async()=>{
    vi.useFakeTimers()
    const fetcher=vi.fn().mockResolvedValueOnce({ok:false,status:429}).mockResolvedValue({ok:true,json:async()=>({id:'me'})})
    const client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher})
    const result=client.me();await vi.advanceTimersByTimeAsync(1000);expect(await result).toEqual({id:'me'});expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockReset().mockResolvedValue({ok:false,status:503})
    await expect(client.register('Name')).rejects.toMatchObject({status:503});expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps equipment writes scoped to the selected organization',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:'booking'})}),client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher}),body={version:1,requestId:'request',conditions:[{equipmentId:'item',condition:'good' as const,notes:''}]}
    await client.equipment('org/id').checkout('booking/id',body)
    expect(fetcher).toHaveBeenCalledWith('https://example.com/organizations/org%2Fid/equipment/reservations/booking%2Fid/checkout',expect.objectContaining({method:'POST',body:JSON.stringify(body)}))
  })

})
