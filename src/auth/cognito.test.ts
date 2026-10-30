// @vitest-environment node
import { webcrypto } from 'node:crypto'
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { accessToken, acceptPasswordTokens, authConfiguration, clearJwksCache, clearSignIn, enterPreview, finishSignIn, getStoredSession, isPreview, logoutUrl, signInUrl } from './cognito'
import { loginProviders, providerName } from './providers'

const config = authConfiguration('http://localhost:5174')
const values = new Map<string, string>()
const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }
const localValues = new Map<string, string>()
const localStorageMock = { get length(){return localValues.size},key:(index:number)=>[...localValues.keys()][index]??null,getItem: (key: string) => localValues.get(key) ?? null, setItem: (key: string, value: string) => localValues.set(key, value), removeItem: (key: string) => localValues.delete(key) }
let keyPair: Awaited<ReturnType<typeof webcrypto.subtle.generateKey>>
let publicKey: object
const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
async function jwt(claims: object) {
  const unsigned = `${encode({ alg: 'RS256', kid: 'test-key' })}.${encode(claims)}`
  const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', (keyPair as webcrypto.CryptoKeyPair).privateKey, Buffer.from(unsigned))
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`
}
async function mockResponse(overrides: { id?: object; access?: object; tamper?: boolean } = {}) {
  const pending = JSON.parse(values.get('studiostack.oauth.pending')!) as { state: string; nonce: string }
  const common = { iss: config.issuer, sub: 'test-member', exp: Math.floor(Date.now() / 1000) + 900, iat: Math.floor(Date.now() / 1000) }
  let access = await jwt({ ...common, token_use: 'access', client_id: config.clientId, scope: 'openid aws.cognito.signin.user.admin studiostack-api/access', ...overrides.access })
  if (overrides.tamper) access = `${access.slice(0, -12)}AAAAAAAAAAAA`
  const id = await jwt({ ...common, token_use: 'id', aud: config.clientId, nonce: pending.nonce, email: 'member@example.test', email_verified: true, ...overrides.id })
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: access, id_token: id, refresh_token: 'never-store-this' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [publicKey] })))
  vi.stubGlobal('fetch', fetcher)
  return { callback: `${config.redirectUri}?code=test-code&state=${pending.state}`, fetcher, access }
}
beforeAll(async () => {
  keyPair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
  publicKey = { ...await webcrypto.subtle.exportKey('jwk', (keyPair as webcrypto.CryptoKeyPair).publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' }
})
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto); vi.stubGlobal('sessionStorage', storage); vi.stubGlobal('localStorage', localStorageMock); values.clear(); localValues.clear(); clearSignIn()
  vi.stubEnv('NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS', ''); vi.stubEnv('NEXT_PUBLIC_COGNITO_SAML_PROVIDER', '')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })

describe('Cognito browser sign-in', () => {
  it('fails closed for unconnected social and SAML options', async () => {
    expect(loginProviders().every(provider => provider.identityProvider === null)).toBe(true)
    for (const provider of ['google', 'apple', 'saml'] as const) {
      await expect(signInUrl(config, provider)).rejects.toThrow('not connected')
    }
    expect(values.size).toBe(0)
  })
  it.each([['google', 'Google'], ['apple', 'SignInWithApple'], ['saml', 'UF']] as const)('routes %s through Cognito with the same PKCE flow', async (provider, name) => {
    vi.stubEnv('NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS', 'Google, SignInWithApple, UF')
    vi.stubEnv('NEXT_PUBLIC_COGNITO_SAML_PROVIDER', 'UF')
    const url = new URL(await signInUrl(config, provider))
    expect(url.origin).toBe(config.domain)
    expect(url.searchParams.get('identity_provider')).toBe(name)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(url.searchParams.get('state')).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()
  })
  it('does not enable an unsafe or non-allowlisted SAML provider', () => {
    vi.stubEnv('NEXT_PUBLIC_COGNITO_SAML_PROVIDER', 'UF')
    expect(() => providerName('saml')).toThrow()
    for (const name of ['https://evil.example', 'Google', 'COGNITO', 'UF&redirect=evil']) {
      vi.stubEnv('NEXT_PUBLIC_COGNITO_SAML_PROVIDER', name)
      vi.stubEnv('NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS', name)
      expect(() => providerName('saml')).toThrow()
    }
  })
  it('uses code + S256 PKCE and stores only pending proof, state and nonce', async () => {
    const url = new URL(await signInUrl(config))
    const pending = JSON.parse(values.get('studiostack.oauth.pending')!)
    expect(url.origin).toBe(config.domain)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).not.toBe(pending.verifier)
    expect(url.searchParams.get('state')).toBe(pending.state)
    expect(url.searchParams.get('nonce')).toBe(pending.nonce)
    expect(url.searchParams.has('client_secret')).toBe(false)
    expect(url.searchParams.has('identity_provider')).toBe(false)
    expect([...values.keys()]).toEqual(['studiostack.oauth.pending'])
  })
  it('requires explicit configuration outside registered localhost', () => {
    expect(() => authConfiguration('http://127.0.0.1:5174')).toThrow()
    expect(() => authConfiguration('https://unconfigured.example')).toThrow()
    expect(new URL(logoutUrl(config)).searchParams.get('logout_uri')).toBe('http://localhost:5174/')
  })
  it.each(['wrong-state', 'expired', 'wrong-origin'])('rejects %s before exchanging a code', async reason => {
    await signInUrl(config)
    const pending = JSON.parse(values.get('studiostack.oauth.pending')!)
    if (reason === 'expired') { pending.createdAt = Date.now() - 600_001; values.set('studiostack.oauth.pending', JSON.stringify(pending)) }
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(finishSignIn(config, `${reason === 'wrong-origin' ? 'https://evil.example/login/' : config.redirectUri}?code=x&state=${reason === 'wrong-state' ? 'wrong' : pending.state}`)).rejects.toThrow('expired')
    expect(fetcher).not.toHaveBeenCalled()
    expect(values.has('studiostack.oauth.pending')).toBe(false)
  })
  it('verifies signed tokens, keeps them in memory and prevents duplicate exchanges/replay', async () => {
    await signInUrl(config)
    const { callback, fetcher, access } = await mockResponse()
    const first = finishSignIn(config, callback), second = finishSignIn(config, callback)
    expect(first).toBe(second)
    expect(await first).toMatchObject({ subject: 'test-member', label: 'member@example.test' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[0][1].body)).toContain('code_verifier=')
    expect(await accessToken()).toBe(access)
    expect(values.size).toBe(0)
    await expect(finishSignIn(config, callback)).rejects.toThrow('expired')
    await expect(accessToken()).rejects.toThrow('session expired')
  })
  it.each([
    { id: { nonce: 'wrong' } }, { id: { aud: 'other-client' } }, { id: { sub: 'other-user' } },
    { access: { iss: 'https://wrong-issuer.example' } }, { access: { token_use: 'id' } },
    { access: { client_id: 'other-client' } }, { access: { scope: 'openid' } },
    { access: { exp: 1 } }, { tamper: true },
  ])('rejects invalid claims or signatures: %j', async overrides => {
    await signInUrl(config)
    const { callback } = await mockResponse(overrides)
    await expect(finishSignIn(config, callback)).rejects.toThrow()
    await expect(accessToken()).rejects.toThrow('session expired')
    expect(values.size).toBe(0)
  })
  it('does not display untrusted provider error text', async () => {
    const url = new URL(await signInUrl(config))
    await expect(finishSignIn(config, `${config.redirectUri}?error=access_denied&error_description=secret&state=${url.searchParams.get('state')}`)).rejects.toThrow('cancelled')
    expect(values.size).toBe(0)
  })
  it('preview never receives real credentials, and expiry removes access', async () => {
    await signInUrl(config)
    const { callback } = await mockResponse()
    await finishSignIn(config, callback)
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 901_000)
    await expect(accessToken()).rejects.toThrow('session expired')
    enterPreview()
    expect(isPreview()).toBe(true)
    await expect(accessToken()).rejects.toThrow('session expired')
    expect([...values.entries()]).toEqual([['studiostack.preview', 'yes']])
  })
  it('verifies SDK tokens without an OAuth callback and still rejects ID tokens as API access',async()=>{
    const common={iss:config.issuer,sub:'sdk-user',exp:Math.floor(Date.now()/1000)+900,iat:Math.floor(Date.now()/1000)}
    const access=await jwt({...common,token_use:'access',client_id:config.clientId,scope:'aws.cognito.signin.user.admin'}),id=await jwt({...common,token_use:'id',aud:config.clientId,email:'member@example.test',email_verified:true})
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({keys:[publicKey]}))))
    expect(await acceptPasswordTokens(access,id,config)).toMatchObject({subject:'sdk-user',label:'member@example.test'});expect(await accessToken()).toBe(access);expect(values.size).toBe(0)
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({keys:[publicKey]}))))
    await expect(acceptPasswordTokens(id,id,config)).rejects.toThrow('verify sign-in');await expect(accessToken()).rejects.toThrow('expired')
  })
  it('retains stored SDK tokens when signing-key service is temporarily unavailable',async()=>{
    localValues.set('studiostack.cognito.example.refreshToken','retained')
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('network unavailable')))
    await expect(acceptPasswordTokens('access','id',config)).rejects.toThrow('unavailable')
    expect(localValues.get('studiostack.cognito.example.refreshToken')).toBe('retained')
    expect(getStoredSession()).toBeNull()
  })
  it('never trusts a user and bearer token injected into local storage', () => {
    localValues.set('studiostack.session.token','forged')
    localValues.set('studiostack.session.user',JSON.stringify({subject:'forged',label:'Admin',expiresAt:Date.now()+999999}))
    expect(getStoredSession()).toBeNull()
  })
  it('keeps a verified session in memory for the current page', async () => {
    await signInUrl(config)
    const { callback, access } = await mockResponse()
    const user = await finishSignIn(config, callback)
    expect(getStoredSession()?.token).toBe(access)
    expect(getStoredSession()?.user.label).toBe(user.label)
    expect(await accessToken()).toBe(access)
  })
  it('caches JWKS signing keys in memory to eliminate redundant network round-trips', async () => {
    const common = { iss: config.issuer, sub: 'cached-user', exp: Math.floor(Date.now() / 1000) + 900, iat: Math.floor(Date.now() / 1000) }
    const access1 = await jwt({ ...common, token_use: 'access', client_id: config.clientId, scope: 'aws.cognito.signin.user.admin' })
    const id1 = await jwt({ ...common, token_use: 'id', aud: config.clientId, email: 'member1@example.test', email_verified: true })
    const access2 = await jwt({ ...common, token_use: 'access', client_id: config.clientId, scope: 'aws.cognito.signin.user.admin' })
    const id2 = await jwt({ ...common, token_use: 'id', aud: config.clientId, email: 'member2@example.test', email_verified: true })

    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ keys: [publicKey] }))))
    vi.stubGlobal('fetch', fetcher)

    // First acceptance fetches JWKS from network
    const user1 = await acceptPasswordTokens(access1, id1, config)
    expect(user1.label).toBe('member1@example.test')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Second acceptance uses cached JWKS keys in memory (0 network requests)
    const user2 = await acceptPasswordTokens(access2, id2, config)
    expect(user2.label).toBe('member2@example.test')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Explicit cache clearance causes next acceptance to fetch fresh keys
    clearJwksCache()
    const user3 = await acceptPasswordTokens(access1, id1, config)
    expect(user3.label).toBe('member1@example.test')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

})
