// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDatabaseApiClient } from './database'

afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks()})

describe('authenticated database browser client', () => {
  it('starts independent reads immediately even in production',async()=>{
    vi.useFakeTimers()
    vi.stubEnv('NODE_ENV','production')
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({})})
    const client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher})
    try{const work=Promise.all([client.me(),client.organizations(),client.inventory('org')]);await vi.advanceTimersByTimeAsync(0);expect(fetcher).toHaveBeenCalledTimes(3);await work}finally{vi.unstubAllEnvs()}
  })

  it('coalesces pending identical reads across page clients, then fetches fresh data',async()=>{
    let resolve!:(value:Response)=>void
    const fetcher=vi.fn().mockImplementation(()=>new Promise<Response>(done=>{resolve=done}))
    const options={baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher}
    const first=createDatabaseApiClient(options).inventory('org'),second=createDatabaseApiClient(options).inventory('org')
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
    resolve(new Response(JSON.stringify({items:[],nextCursor:null})))
    expect(await first).toEqual(await second)
    fetcher.mockResolvedValue(new Response(JSON.stringify({items:[{id:'new'}]})))
    expect(await createDatabaseApiClient(options).inventory('org')).toEqual({items:[{id:'new'}]})
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not share pending reads between identities or organizations',async()=>{
    let resolve!:()=>void
    const gate=new Promise<void>(done=>{resolve=done})
    const fetcher=vi.fn().mockImplementation(async()=>{await gate;return new Response('{}')})
    const client=(token:string)=>createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=>token,fetch:fetcher})
    const work=Promise.all([client('first').inventory('one'),client('second').inventory('one'),client('first').inventory('two')])
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3))
    resolve();await work
  })

  it('does not reuse a read started before a write for the post-write refresh',async()=>{
    let resolve!:(value:Response)=>void
    const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done})).mockImplementation(async()=>new Response(JSON.stringify({id:'fresh'})))
    const client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher})
    const old=client.me();await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
    await client.register('Name');expect(await client.me()).toEqual({id:'fresh'});expect(fetcher).toHaveBeenCalledTimes(3)
    resolve(new Response(JSON.stringify({id:'old'})));await old
  })

  it('times out a stalled read without replaying it after the deadline',async()=>{
    const controller=new AbortController();const timeout=vi.spyOn(AbortSignal,'timeout').mockReturnValue(controller.signal)
    const fetcher=vi.fn((_url:unknown,options:{signal?:AbortSignal|null}={})=>new Promise<Response>((_resolve,reject)=>options.signal!.addEventListener('abort',()=>reject(options.signal!.reason),{once:true})))
    const client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher})
    const result=client.me();const rejected=expect(result).rejects.toMatchObject({name:'TimeoutError'})
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());expect(timeout).toHaveBeenCalledWith(15_000);controller.abort(new DOMException('Request timed out','TimeoutError'));await rejected;expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ends retry backoff immediately when the overall read deadline expires',async()=>{
    vi.useFakeTimers()
    const controller=new AbortController();vi.spyOn(AbortSignal,'timeout').mockReturnValue(controller.signal)
    const fetcher=vi.fn().mockResolvedValue({ok:false,status:429,headers:new Headers({'retry-after':'10'})})
    const client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher})
    const work=client.me(),rejected=expect(work).rejects.toMatchObject({name:'TimeoutError'})
    await vi.advanceTimersByTimeAsync(0);expect(fetcher).toHaveBeenCalledTimes(1)
    controller.abort(new DOMException('Read deadline expired','TimeoutError'));await rejected
    await vi.advanceTimersByTimeAsync(10000);expect(fetcher).toHaveBeenCalledTimes(1)
  })

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

  it('keeps report list query parameters on the collection route',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({items:[],nextCursor:null})}),client=createDatabaseApiClient({baseUrl:'https://example.com',getAccessToken:async()=> 'token',fetch:fetcher})
    await client.reports('org/id').list();expect(fetcher.mock.calls[0][0]).toBe('https://example.com/organizations/org%2Fid/equipment/reports?limit=100')
  })

})
