import {clearVolatileAuthState} from './volatileStorage'
import { providerName } from './providers'
import type { LoginProvider } from './providers'
import { userPoolPattern } from '../types/patterns'
/** Public browser configuration only. No AWS keys, client secret or DB credentials. */
export interface AuthConfig { domain: string; issuer: string; clientId: string; redirectUri: string; apiUrl: string }
export interface SignedInUser { subject: string; label: string; expiresAt: number }
type Claims = Record<string, unknown>
type SigningKey = { kid?: string; kty?: string; use?: string; alg?: string; n?: string; e?: string }
type Pending = { state: string; nonce: string; verifier: string; createdAt: number; redirectUri: string }
type VerifiedSession = { token:string; user:SignedInUser }
type OAuthSession = { binding:string; subject:string; nonce:string; refreshToken:string }
type OAuthTokens = { access_token?: unknown; id_token?: unknown; refresh_token?: unknown }
const oauthKey = 'studiostack.oauth.session'
const pendingKey = 'studiostack.oauth.pending'
const previewKey = 'studiostack.preview'
const sessionTokenKey = 'studiostack.session.token'
const sessionUserKey = 'studiostack.session.user'
let memory:VerifiedSession|null=null
let oauthMemory:OAuthSession|null=null
let refreshing:{key:string;request:Promise<SignedInUser|null>}|undefined
let signingOut=false
let generation=0
let finishing: Promise<SignedInUser> | undefined

function readStorage(storage?: Storage, key = ''): string | null {
  try { return storage?.getItem(key) ?? null } catch { return null }
}
function writeStorage(storage: Storage | undefined, key: string, value: string) {
  try { storage?.setItem(key, value) } catch { /* ignore storage errors */ }
}
function removeStorage(storage: Storage | undefined, key: string) {
  try { storage?.removeItem(key) } catch { /* ignore storage errors */ }
}

export function getStoredSession(): { token: string; user: SignedInUser } | null {
  return !signingOut && memory && memory.user.expiresAt > Date.now() + 10_000 ? memory : null
}

export function authConfiguration(origin = window.location.origin): AuthConfig {
  const local = origin === 'http://localhost:5174'
  const pool = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? (local ? 'us-east-2_ijF1G9yWI' : '')
  const config = {
    domain: process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? (local ? 'https://studiostack-dev-423563856930.auth.us-east-2.amazoncognito.com' : ''),
    clientId: process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID ?? (local ? 'nudotcmmbchpmqb9u8jnojk4k' : ''),
    issuer: `https://cognito-idp.us-east-2.amazonaws.com/${pool}`,
    redirectUri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI ?? `${origin}/login/`,
    apiUrl: process.env.NEXT_PUBLIC_DATABASE_API_URL ?? (local ? 'https://vugf6fpl4k.execute-api.us-east-2.amazonaws.com' : ''),
  }
  if (!userPoolPattern.test(pool) || !/^[a-z0-9]{1,128}$/.test(config.clientId)) throw new Error('Sign-in is not configured for this website yet.')
  const domain = new URL(config.domain), callback = new URL(config.redirectUri), api = new URL(config.apiUrl)
  if (domain.protocol !== 'https:' || !/^[a-z0-9-]+\.auth\.us-east-2\.amazoncognito\.com$/.test(domain.hostname) || domain.pathname !== '/' || domain.search || domain.hash || domain.username || domain.password || domain.port ||
      callback.origin !== origin || callback.pathname !== '/login/' || callback.search || callback.hash || callback.username || callback.password ||
      (!local && callback.protocol !== 'https:') || api.protocol !== 'https:' || api.username || api.password || api.search || api.hash) throw new Error('Use a configured website address to sign in. Local development uses localhost:5174.')
  return { ...config, domain: domain.origin, apiUrl: api.href.replace(/\/$/, '') }
}
function random() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function bytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid sign-in response.')
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}
export async function signInUrl(config = authConfiguration(), provider?: LoginProvider): Promise<string> {
  // Never redirect to a provider based on arbitrary input or an unconnected UI option.
  const identityProvider = provider ? providerName(provider) : undefined
  const verifier = random(), state = random(), nonce = random()
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const query = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: 'openid profile email aws.cognito.signin.user.admin studiostack-api/access',
    code_challenge_method: 'S256', code_challenge: base64url(new Uint8Array(digest)), state, nonce })
  if (identityProvider) query.set('identity_provider', identityProvider)
  sessionStorage.setItem(pendingKey, JSON.stringify({ state, nonce, verifier, createdAt: Date.now(), redirectUri: config.redirectUri } satisfies Pending))
  return `${config.domain}/oauth2/authorize?${query}`
}
async function verify(token: string, config: AuthConfig, keys: SigningKey[], type: 'id' | 'access', nonce?: string, refreshing = false): Promise<Claims> {
  const segments = token.split('.')
  if (segments.length !== 3 || token.length > 16_000) throw new Error('Invalid sign-in response.')
  const header = JSON.parse(new TextDecoder().decode(bytes(segments[0]))) as { alg: string; kid: string }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid sign-in response.')
  const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig' && key.alg === 'RS256')
  if (!jwk) throw new Error('Could not verify sign-in. Please try again.')
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(segments[2]), new TextEncoder().encode(`${segments[0]}.${segments[1]}`))
  const claims = JSON.parse(new TextDecoder().decode(bytes(segments[1]))) as Claims
  if (!valid || claims.iss !== config.issuer || claims.token_use !== type || typeof claims.sub !== 'string' || !claims.sub ||
      typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 || typeof claims.iat !== 'number' || claims.iat > Date.now() / 1000 + 60 ||
      (type === 'id' ? claims.aud !== config.clientId || (!refreshing || claims.nonce !== undefined) && claims.nonce !== nonce : claims.client_id !== config.clientId || typeof claims.scope !== 'string' || !claims.scope.split(' ').includes('aws.cognito.signin.user.admin'))) throw new Error('Could not verify sign-in. Please try again.')
  return claims
}
export function hasCallback(url = window.location.href) { const params = new URL(url).searchParams; return params.has('code') || params.has('error') }
export function finishSignIn(config = authConfiguration(), url = window.location.href): Promise<SignedInUser> {
  // React Strict Mode can run an effect twice; never exchange a code twice.
  if (finishing) return finishing
  finishing = complete(config, url).finally(() => { finishing = undefined })
  return finishing
}
async function complete(config: AuthConfig, url: string): Promise<SignedInUser> {
  const current=++generation
  try {
    const callback = new URL(url), stored = sessionStorage.getItem(pendingKey)
    if (callback.origin !== new URL(config.redirectUri).origin || callback.pathname !== '/login/' || !stored) throw new Error('This sign-in link has expired. Start sign-in again.')
    const pending = JSON.parse(stored) as Pending
    if (!pending.state || callback.searchParams.get('state') !== pending.state || pending.redirectUri !== config.redirectUri || !pending.verifier || !pending.nonce ||
        !Number.isFinite(pending.createdAt) || Date.now() - pending.createdAt > 600_000 || pending.createdAt > Date.now()) throw new Error('This sign-in link has expired. Start sign-in again.')
    sessionStorage.removeItem(pendingKey)
    if (callback.searchParams.has('error')) throw new Error('Sign-in was cancelled or could not be completed. Please try again.')
    const code = callback.searchParams.get('code')
    if (!code || code.length > 2048) throw new Error('Invalid sign-in response.')
    const response = await postOAuth(config,'token',{grant_type:'authorization_code',redirect_uri:config.redirectUri,code,code_verifier:pending.verifier})
    if (!response.ok) throw new Error('Sign-in could not be completed. Please try again.')
    const result = await response.json() as OAuthTokens
    const session=await verifiedTokens(result,config,pending.nonce)
    if(generation!==current||signingOut)throw new Error('Sign-in was cancelled. Please try again.')
    clearVolatileAuthState()
    clearOAuthSession()
    if(validRefreshToken(result.refresh_token))saveOAuthSession({
      binding:oauthBinding(config),subject:session.user.subject,nonce:pending.nonce,refreshToken:result.refresh_token
    })
    return installSession(session)
  } catch (error) {
    if(generation===current)clearSignIn()
    throw error instanceof Error && /^(This sign-in|Invalid sign-in|Sign-in |Could not verify)/.test(error.message) ? error : new Error('Sign-in is temporarily unavailable. Please try again.')
  } finally { sessionStorage.removeItem(pendingKey) }
}
export class AuthenticationUnavailable extends Error {constructor(){super('Authentication service is unavailable. Try again when connected.')}}
/** Drop verified in-memory tokens without discarding a recoverable SDK session. */
export function forgetVerifiedSession(){memory=null}

interface JwksCacheEntry {
  keys: SigningKey[]
  fetchedAt: number
}
const jwksCache = new Map<string, JwksCacheEntry>()
const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export function clearJwksCache(issuer?: string) {
  if (issuer) jwksCache.delete(issuer)
  else jwksCache.clear()
}

function extractKid(token: string): string | undefined {
  try {
    const segments = token.split('.')
    if (segments.length !== 3 || token.length > 16_000) return undefined
    const header = JSON.parse(new TextDecoder().decode(bytes(segments[0]))) as { kid?: string; alg?: string }
    return typeof header.kid === 'string' && header.alg === 'RS256' ? header.kid : undefined
  } catch {
    return undefined
  }
}

async function fetchSigningKeys(config: AuthConfig): Promise<SigningKey[]> {
  let jwks: Response
  try {
    jwks = await fetch(`${config.issuer}/.well-known/jwks.json`, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new AuthenticationUnavailable()
  }
  if (!jwks.ok) throw new AuthenticationUnavailable()
  const { keys } = await jwks.json() as { keys?: SigningKey[] }
  if (!Array.isArray(keys) || keys.length > 10) throw new Error('Invalid sign-in response.')
  jwksCache.set(config.issuer, { keys, fetchedAt: Date.now() })
  return keys
}

async function getSigningKeys(config: AuthConfig, requiredKids: (string | undefined)[]): Promise<SigningKey[]> {
  const cached = jwksCache.get(config.issuer)
  const validKids = requiredKids.filter((k): k is string => Boolean(k))
  const hasAllKids = validKids.length > 0 && validKids.every(kid => cached?.keys.some(k => k.kid === kid))
  if (cached && hasAllKids && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cached.keys
  }
  return fetchSigningKeys(config)
}

function oauthBinding(config:AuthConfig){
  return JSON.stringify([config.domain,config.issuer,config.clientId,config.redirectUri])
}
function validRefreshToken(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=16_000&&!/\s/.test(value)
}
function readOAuthSession(config:AuthConfig):OAuthSession|null{
  const raw=readStorage(globalThis.sessionStorage,oauthKey)
  try {
    const session=raw?JSON.parse(raw) as OAuthSession:oauthMemory
    if(session?.binding===oauthBinding(config)&&typeof session.subject==='string'&&session.subject&&
      typeof session.nonce==='string'&&session.nonce&&validRefreshToken(session.refreshToken))return session
  } catch { /* Invalid tab state must not establish a session. */ }
  return null
}
function saveOAuthSession(session:OAuthSession){
  oauthMemory=session
  writeStorage(globalThis.sessionStorage,oauthKey,JSON.stringify(session))
}
function clearOAuthSession(){
  oauthMemory=null
  removeStorage(globalThis.sessionStorage,oauthKey)
}
function postOAuth(config:AuthConfig,endpoint:'token'|'revoke',fields:Record<string,string>){
  return fetch(`${config.domain}/oauth2/${endpoint}`,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(15_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({client_id:config.clientId,...fields})})
}
async function verifiedTokens(tokens:OAuthTokens,config:AuthConfig,nonce?:string,expectedSubject?:string):Promise<VerifiedSession>{
  const {access_token:accessToken,id_token:idToken}=tokens
  if(typeof accessToken!=='string'||typeof idToken!=='string')throw new Error('Invalid sign-in response.')
  const keys=await getSigningKeys(config,[extractKid(accessToken),extractKid(idToken)])
  const [access,id]=await Promise.all([
    verify(accessToken,config,keys,'access'),
    verify(idToken,config,keys,'id',nonce,expectedSubject!==undefined)
  ])
  if(access.sub!==id.sub||expectedSubject!==undefined&&access.sub!==expectedSubject)throw new Error('Could not verify sign-in. Please try again.')
  const label=id.email_verified===true&&typeof id.email==='string'?id.email:typeof id.name==='string'?id.name:typeof id['cognito:username']==='string'?id['cognito:username']:'StudioStack member'
  return {token:accessToken,user:{subject:access.sub as string,label:label.slice(0,254),expiresAt:Number(access.exp)*1000}}
}
function installSession(session:VerifiedSession){
  memory=session
  removeStorage(globalThis.localStorage,sessionTokenKey)
  removeStorage(globalThis.localStorage,sessionUserKey)
  removeStorage(globalThis.sessionStorage,previewKey)
  return session.user
}

/** Validates both SDK tokens against the pool signing keys before use. */
export async function acceptPasswordTokens(accessTokenValue:string,idTokenValue:string,config:AuthConfig):Promise<SignedInUser>{
  const current=generation
  try {
    const session=await verifiedTokens({access_token:accessTokenValue,id_token:idTokenValue},config)
    if(generation!==current||signingOut)throw new Error('Sign-in was cancelled. Please try again.')
    clearOAuthSession()
    return installSession(session)
  } catch(error) {
    if(error instanceof AuthenticationUnavailable)throw error
    if(generation===current&&!signingOut)clearSignIn()
    throw new Error('Could not verify sign-in. Please try again.')
  }
}
async function refreshOAuthSession(config:AuthConfig,session:OAuthSession){
  const current=generation
  const response=await postOAuth(config,'token',{grant_type:'refresh_token',refresh_token:session.refreshToken})
    .catch(()=>{throw new AuthenticationUnavailable()})
  if(generation!==current)return null
  if(response.status===429||response.status>=500)throw new AuthenticationUnavailable()
  if(!response.ok){
    clearSignIn()
    return null
  }
  try{
    const tokens=await response.json() as OAuthTokens
    const verified=await verifiedTokens(tokens,config,session.nonce,session.subject)
    if(generation!==current)return null
    if(tokens.refresh_token!==undefined){
      if(!validRefreshToken(tokens.refresh_token))throw new Error('Invalid sign-in response.')
      saveOAuthSession({...session,refreshToken:tokens.refresh_token})
    }
    return signingOut?null:installSession(verified)
  }catch(error){
    if(error instanceof AuthenticationUnavailable)throw error
    if(generation===current)clearSignIn()
    throw new Error('Could not verify sign-in. Please try again.')
  }
}

/** One restore path for initial load, renewal timers and on-demand access. */
export async function restoreSession(config=authConfiguration(),forceRefresh=false):Promise<SignedInUser|null>{
  if(signingOut)return null
  const oauth=readOAuthSession(config)
  if(oauth){
    const stored=getStoredSession()
    if(!forceRefresh&&stored?.user.subject===oauth.subject)return stored.user
    const key=JSON.stringify([oauth.binding,oauth.subject,oauth.refreshToken])
    if(refreshing?.key===key)return refreshing.request
    const request=refreshOAuthSession(config,oauth).finally(()=>{if(refreshing?.request===request)refreshing=undefined})
    refreshing={key,request}
    return request
  }
  const {restorePasswordSession}=await import('./password')
  return restorePasswordSession(config,forceRefresh)
}
export async function accessToken():Promise<string>{
  const session=getStoredSession()
  if(session)return session.token
  let restored:SignedInUser|null=null
  try{restored=await restoreSession()}catch{/* A failed refresh cannot establish a session. */}
  const current=getStoredSession()
  if(!restored||!current||restored.subject!==current.user.subject)throw new Error('Your session expired. Sign in again.')
  return current.token
}
export async function signOutSession(config=authConfiguration()){
  signingOut=true
  memory=null
  try {
    await refreshing?.request.catch(()=>null)
    const oauth=readOAuthSession(config)
    if(oauth){
      clearSignIn()
      await postOAuth(config,'revoke',{token:oauth.refreshToken})
    }else{
      const {signOutPasswordSession}=await import('./password')
      await signOutPasswordSession(config)
    }
  } finally {
    clearSignIn()
    signingOut=false
  }
}
export function clearSignIn() {
  generation++
  memory = null
  clearOAuthSession()
  clearVolatileAuthState()
  clearJwksCache()
  removeStorage(globalThis.localStorage, sessionTokenKey)
  removeStorage(globalThis.localStorage, sessionUserKey)
  removeStorage(globalThis.sessionStorage, pendingKey)
  removeStorage(globalThis.sessionStorage, previewKey)
}
export function enterPreview() { clearSignIn(); writeStorage(globalThis.sessionStorage, previewKey, 'yes') }
export function isPreview() { return readStorage(globalThis.sessionStorage, previewKey) === 'yes' }
export function logoutUrl(config = authConfiguration()) { return `${config.domain}/logout?${new URLSearchParams({ client_id: config.clientId, logout_uri: new URL(config.redirectUri).origin + '/' })}` }
