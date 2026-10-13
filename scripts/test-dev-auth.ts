import { createHash, randomBytes } from 'node:crypto'
import { aws } from './dev-aws'
import type { DevMetadata } from './deploy-dev-api'

export interface TestIdentity { username: string; subject: string; token: string; idToken: string }
/** Real OAuth code+PKCE, using only admin-created synthetic dev accounts.
 * Cookies, password and tokens stay in process memory and are never logged.
 */
export async function syntheticSignIn(metadata: DevMetadata, runId: string, label: string): Promise<TestIdentity> {
  const username = `dev-drill-${runId}-${label}`, password = `${randomBytes(32).toString('base64url')}aA1!`
  await aws('cognito-idp', 'admin-create-user', ['--user-pool-id', metadata.auth.UserPoolId, '--username', username, '--message-action', 'SUPPRESS'])
  try {
    await aws('cognito-idp', 'admin-set-user-password', ['--user-pool-id', metadata.auth.UserPoolId, '--username', username, '--password', password, '--permanent'])
    const verifier = randomBytes(32).toString('base64url'), state = randomBytes(24).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const query = new URLSearchParams({ response_type: 'code', client_id: metadata.auth.AppClientId, redirect_uri: 'http://localhost:5417/callback', scope: 'openid profile studiostack-api/access', code_challenge: challenge, code_challenge_method: 'S256', state })
    const cookies = new Map<string, string>()
    async function request(url: string, init?: Parameters<typeof fetch>[1]) {
      const response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { ...(Object.fromEntries(new Headers(init?.headers))), Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } })
      for (const cookie of response.headers.getSetCookie()) { const [key, ...value] = cookie.split(';')[0].split('='); cookies.set(key, value.join('=')) }
      return response
    }
    let url = `${metadata.auth.Domain}/oauth2/authorize?${query}`, response = await request(url)
    for (let i = 0; i < 6 && response.status >= 300 && response.status < 400; i++) { url = new URL(response.headers.get('location')!, url).href; response = await request(url) }
    const html = await response.text()
    const csrf = html.match(/name="_csrf"[^>]*value="([^"]+)"/)?.[1] ?? html.match(/value="([^"]+)"[^>]*name="_csrf"/)?.[1]
    if (!csrf || response.status !== 200 || !url.startsWith(metadata.auth.Domain)) throw new Error('Dev hosted login page not available')
    response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: metadata.auth.Domain, Referer: url }, body: new URLSearchParams({ _csrf: csrf, username, password, signInSubmitButton: 'Sign in' }) })
    let callback: URL | undefined
    for (let i = 0; i < 8 && response.status >= 300 && response.status < 400; i++) {
      const next = new URL(response.headers.get('location')!, url)
      if (next.origin === 'http://localhost:5417' && next.pathname === '/callback') { callback = next; break }
      if (next.origin !== metadata.auth.Domain) throw new Error('Unexpected login redirect')
      url = next.href; response = await request(url)
    }
    if (!callback || callback.searchParams.get('state') !== state || !callback.searchParams.get('code')) throw new Error('Dev hosted login did not complete')
    const tokensResponse = await fetch(`${metadata.auth.Domain}/oauth2/token`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: metadata.auth.AppClientId, redirect_uri: 'http://localhost:5417/callback', code: callback.searchParams.get('code')!, code_verifier: verifier }), signal: AbortSignal.timeout(20_000) })
    if (!tokensResponse.ok) throw new Error('Dev PKCE exchange failed')
    const tokens = await tokensResponse.json() as { access_token: string; id_token: string }
    const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString()) as { sub: string; token_use: string; scope: string; iss: string; client_id: string }
    if (claims.token_use !== 'access' || claims.iss !== metadata.auth.Issuer || claims.client_id !== metadata.auth.AppClientId || !claims.scope.split(' ').includes('studiostack-api/access')) throw new Error('Unexpected dev token claims')
    return { username, subject: claims.sub, token: tokens.access_token, idToken: tokens.id_token }
  } catch (error) {
    await aws('cognito-idp', 'admin-delete-user', ['--user-pool-id', metadata.auth.UserPoolId, '--username', username])
    throw error
  }
}
