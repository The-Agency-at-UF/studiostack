# StudioStack sign-in

`/login/` contains StudioStack's own email/password, email-recovery and invited-account password screens. Cognito handles authentication through Amplify's SRP flow; the app does not send passwords to the StudioStack database API. People can create an account from **Sign up**, verify the email code, and then sign in. Creating an account grants no organization membership or role. Organization administrators issue workspace invitations. Unconfirmed accounts return to email verification on sign-in, with an explicit resend option.

The approved policy requires at least **8 characters, one uppercase letter and one special character**. Lowercase letters and digits are optional. Recovery uses **verified email only**; the interface does not display simulated SMS destinations.

## Session and access

- Access and identity tokens are verified against Cognito signing keys, issuer, client, token type and expiry before the app establishes its session. OAuth callbacks also verify state and nonce.
- The Cognito SDK keeps sign-in tokens in browser local storage so the account can be restored after refresh. The app validates both signed tokens against Cognito before loading account membership; the SDK renews them while the refresh token remains valid. Browser storage is accessible to scripts running on this origin, so it is not an HttpOnly cookie. Sign out on shared devices. OAuth proof and short-lived Cognito challenge state use session storage. Sign-out revokes the SDK session and removes its stored tokens; organization records remain in the database. Cognito requires another sign-in when the refresh session expires.
- APIs require the Cognito access-token scope `aws.cognito.signin.user.admin`, which both SRP and the existing OAuth flow provide. API Gateway and the handler validate the configured issuer/client; database membership controls organization access.
- The app checks database readiness, registers only the current user's profile and loads active memberships. New teammates verify their email and accept matching pending invitations from the account screen. An email domain does not grant membership or a role.
- Preview is an explicit separate mode without real credentials or a cloud role.

## Configuration

Run `npm ci` and `npm run dev`, then open `http://localhost:5174/login/`. Hosted builds require the public Cognito/API settings in `.env.example`; no AWS credentials or client secrets belong in frontend configuration. Allow the exact site origin in API/S3 CORS.

Only connected federation providers appear. Configure each provider in Cognito and its public client, then set `NEXT_PUBLIC_COGNITO_ENABLED_PROVIDERS`; SAML also requires `NEXT_PUBLIC_COGNITO_SAML_PROVIDER`. UF federation still requires UFIT coordination. Federation uses the existing authorization-code/S256-PKCE flow and exact `/login/` callback. It never grants an organization membership on its own.

## Verification

Run `npm test -- src/auth src/views/LogIn src/components/AppShell.test.tsx`, `npm run typecheck` and `npm run build`.

`node --import=tsx scripts/test-inline-auth-development.ts --apply-dev` checks live SRP, invalid-password rejection, API/verified-invitation token compatibility, first-password setup and email recovery with isolated Cognito accounts. Recovery mail goes only to the SES mailbox simulator. The script removes its synthetic users and creates no database profiles. Never enter, log or store a teammate's password in test fixtures.
