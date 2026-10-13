# StudioStack login

The `/login/` page uses the existing black, cream and blue workspace branding.
It separates **Cognito sign-in** from **local preview**. UF/institution SSO is
clearly marked unavailable until its identity-provider connection is configured.
Google, Apple and institutional SAML buttons are visible, but show **Coming soon**
and remain disabled by default. This is UI/routing preparation, not a provider deployment.

## Local development

1. Run `npm ci` and `npm run dev` from the repository root.
2. Open `http://localhost:5174/login/` (not `127.0.0.1`).
3. Choose **Continue to sign in** to reach the existing dev Cognito login.
   This pool is invitation-only; public signup is disabled. A real administrator
   must invite an account. This change does not create users or AWS resources.
4. Alternatively, choose **Explore preview** for the local workspace UI.
   Preview mode does not receive AWS credentials or a real account role.

## What is connected

- The browser uses authorization code + S256 PKCE, random state and nonce.
- Callback tokens are verified against the expected Cognito issuer's JWKS,
  signature, expiration, client, token type, nonce and API scope.
- The callback query is removed from the address bar before token exchange.
- Only the temporary sign-in proof/state/nonce and explicit preview marker use
  session storage. Tokens stay in memory, never local storage. Refresh tokens
  are discarded; a full reload or expired session requires sign-in again.
- After verified login, `POST /me` registers the user's own display name and
  `GET /organizations` supplies memberships/roles. No membership is granted by
  the UI. Accounts without memberships see an access-pending message.
- Workspace pages still use the local preview data adapter. Their S3 form uses
  an older contract and is deliberately not given real tokens by this change.
  Organization-scoped live CRUD/photo wiring is a separate implementation step.

## Hosting configuration

Set the public OAuth values listed in `.env.example` before building. Local
defaults are restricted to `http://localhost:5174`; hosted sites fail closed
until configured. Use a public app client (no browser client secret), register
the exact HTTPS `/login/` callback and origin `/` logout URL in Cognito, and allow
the exact website origin in the database API's CORS configuration. These AWS
changes require a separate rollout; production is unchanged here.

### Social and institutional buttons

After configuring an identity provider in the user pool and enabling it on the
public app client, list its exact name in `NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS`.
Google uses `Google`; Apple uses `SignInWithApple`. The SAML option also requires
`NEXT_PUBLIC_COGNITO_SAML_PROVIDER` to match the configured IdP's exact name (for
example `UF`, only after UFIT approves and provides the federation configuration).
Rebuild/restart after changing public environment values. Never add social client
secrets, Apple private keys or SAML signing keys to frontend environment variables.

Each enabled button uses Cognito's `identity_provider` parameter and the existing
code + PKCE callback flow. See [AWS authorization endpoint documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
The current SAML button targets one explicitly configured institution. Supporting
several institutions requires an institution chooser with a verified provider
registry; it must not guess tenancy from an email domain or grant organization
membership from provider selection. Google/Apple federation can create a Cognito
profile at first login; that does not grant any StudioStack organization access.

## Implementation and checks

- `src/views/LogIn/LogIn.tsx`: responsive branded page, account states and actions.
- `src/auth/cognito.ts`: browser OAuth and in-memory session boundary.
- `src/components/AppShell.tsx`: callback handling and route/session gating.
- `npm test -- src/auth/cognito.test.ts src/components/AppShell.test.tsx src/views/LogIn/LogIn.test.tsx`
- `npm run typecheck` and `npm run build`.

Tests use synthetic signed tokens and mocked HTTP responses, not live passwords
or AWS accounts. A live invited-account sign-in is still needed to verify the
entire provider → browser → API flow with real credentials.
