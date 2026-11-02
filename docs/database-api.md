# Database HTTP APIs

## Status and scope

The approved **development** rollout deployed the existing 13 database endpoints plus 3 private-photo endpoints on October 13, 2026. Dev migrations 001–003 and restricted grants are applied. Production schema, code and permissions have not been rolled forward. Live verification and the restore drill are recorded in [the dev rollout guide](dev-rollout.md); deployment alone is not evidence of end-to-end completion. Existing website pages still use the preview store; the authenticated typed HTTP client is opt-in.

This slice supports profiles, organization/member reads, group creation, inventory, reservations with cancellation, and private photo upload/completion/attachment/download. It does not implement organization onboarding, invitations/member-role edits, group membership edits, checkout/return, reservation editing/extensions, reports or notifications.

## Routes

All routes require a Cognito **access token**, sent as `Authorization: Bearer …`, and the Cognito user access scope `aws.cognito.signin.user.admin` (available to both SRP and OAuth sign-in). API Gateway validates JWT signatures, issuer, audience and expiration. The handler additionally checks its expected API ID, issuer, client ID, token type, expiry and scope. It never treats the preview session, request-body roles or email as authorization.

Use `/organizations/{organizationId}` as the organization prefix below. UUIDs are required for organization, database equipment, reservation and request IDs; `equipmentCode` is a separate QR/manual equipment identifier.

| Method/path | Purpose | Authorization |
| --- | --- | --- |
| `GET /me` | Read the current registered profile | Current identity only |
| `POST /me` | Idempotently register/update `displayName` | Current identity only; no role/membership creation |
| `GET /organizations` | List the caller's active organizations | Current identity only |
| `GET {prefix}/members` | List organization members | Active owner/admin |
| `GET {prefix}/administration/directory` | List active members by display name and role, for the Organization page | Any active member; no emails or statuses |
| `GET {prefix}/inventory` | List equipment and operational status | Active member |
| `POST {prefix}/inventory` | Add `equipmentCode`, `name`, `category` | Active owner/admin |
| `PATCH {prefix}/inventory/{itemId}` | Update `name`, `category`, `status` | Active owner/admin |
| `GET {prefix}/reservations` | List reservations | Members: own; owner/admin: organization-wide |
| `POST {prefix}/reservations` | Reserve 1–50 equipment items | Active member; caller owns the booking |
| `GET {prefix}/reservations/{reservationId}` | Read a reservation | Owner of booking or organization owner/admin |
| `POST {prefix}/reservations/{reservationId}/cancel` | Cancel with `{}` body; retain history | Owner of booking or organization owner/admin |
| `POST /photos/uploads` | Authorize exact-sized processed JPEG/WebP staging upload | Active owner/admin in body organization ID |
| `POST {prefix}/photos/{photoId}/complete` | Validate/re-encode staged bytes into a private display JPEG | Uploading owner/admin only |
| `GET {prefix}/inventory/{itemId}/photo` | Issue a 60-second URL for a completed, attached photo | Active member |

Success responses are JSON with HTTP 200 and `Cache-Control: no-store`. Lists return `{ "items": [...], "nextCursor": "uuid-or-null" }`. Pagination uses `limit` (default 50, maximum 100) and `after` (UUID). Unknown fields/query parameters are rejected. Errors use 400 for invalid input, 401 for authentication, 403 for organization permissions, 404 for unavailable records/routes, 409 for conflicts and 503 for backend/configuration failures. Raw driver errors, SQL and credentials are not returned.

`POST /me` stores issuer+subject from trusted authorizer claims. Standard Cognito access tokens typically omit email; profiles permit null email. The body cannot set email, identity or roles. Optional email enrichment accepts a verified claim only. Organizations and initial owner memberships must be provisioned through reviewed maintenance/onboarding work; no endpoint lets someone make themselves an administrator.

## Reservation rules

```json
{
  "name": "Interview shoot",
  "startsAt": "2030-02-01T10:00:00Z",
  "endsAt": "2030-02-01T12:00:00Z",
  "equipmentIds": ["44444444-4444-4444-8444-444444444444"],
  "requestId": "66666666-6666-4666-8666-666666666666"
}
```

Times require an explicit timezone and a valid calendar date. New reservations start in the future, end after their start and last at most 90 days. All selected equipment must belong to the organization and be operationally `available`. This status is **not** time-slot availability; conflict checks use existing confirmed reservations with half-open intervals `[start, end)`.

Booking creation checks active membership, sets a transaction-local tenant context, serializes the request ID with a transaction advisory lock, locks equipment rows in UUID order and then checks for overlaps under READ COMMITTED isolation. All inserts commit together. Simultaneous conflicting requests result in one booking and one 409. Reusing a request ID with identical normalized content returns the same reservation; changed content returns 409. Reuse the original ID after an ambiguous network response; do not generate a new ID on every retry. The browser helper never automatically retries writes.

Cancellation retains the record/items and is idempotent. Equipment cannot be marked maintenance/retired while it has active or future confirmed reservations. This version has no physical checkout/return tracking or availability-search endpoint.

## Database schema and access

- Existing `001_identity_and_groups.sql` is unchanged.
- New `002_inventory_and_reservations.sql` adds inventory, reservations and reservation items, relaxes the profile email requirement, and enables organization row-level security on five tenant-scoped tables.
- `003_private_photos.sql` adds organization-scoped upload records and inventory `photoId` attachment, with RLS and composite foreign keys. Pending or another organization's photo cannot be attached. `photoId: null` unlinks a photo; it does not delete an object.
- Composite foreign keys prevent cross-organization equipment/reservation associations.
- API queries verify active memberships in PostgreSQL, then set `app.organization_id` locally for the transaction. Membership is checked at request admission; an already-running transaction is not retroactively revoked by a concurrent maintenance change.
- `api-grants.ts` grants only schema USAGE and necessary reads/inserts/column updates. Runtime cannot manage memberships, run schema migrations, grant privileges or hard-delete records. It must remain a non-owner, non-superuser role without BYPASSRLS.
- RLS is defense in depth, not a substitute for handler authorization. All SQL parameters are bound; there is no arbitrary SQL endpoint.

Do not apply schema/grant changes casually to production. The nullable-email change and new RLS policies affect existing records/access; review migrations, backup/restore plans and existing group-query consumers first. Apply to dev before scheduling production maintenance.

## Code map

| File | Purpose |
| --- | --- |
| `backend/database/api.ts` | Route parsing, JWT-context checks, validation and safe HTTP responses |
| `backend/database/api-repository.ts` | Tenant authorization, parameterized SQL and atomic booking operations |
| `backend/database/api-entry.ts` | Lambda entry point, preserving the existing IAM-only empty-event connectivity check |
| `backend/database/api-validation.ts` | Strict schemas, UUIDs, sizes, dates and pagination |
| `backend/database/api-grants.ts` | Reviewed, environment-scoped maintenance grants |
| `backend/database/api-setup.ts` | Temporary maintenance-only migration/grant entry point; never an HTTP integration |
| `infra/database/api-resources.ts` | JWT authorizer, 13 database + 3 photo routes and scoped permissions; deployment updates the preexisting upload route in place |
| `src/types/database-api.ts` | Shared request/response contracts |
| `src/api/database.ts` | Opt-in browser/mobile-compatible HTTP helper requiring a real token provider |
| `scripts/prepare-database-api.ts` | Local-only package/template generation; no AWS operations |

## Local verification

```sh
npm run typecheck
npm run test:database
npm run test:database:postgres
npm run build
```

The PostgreSQL command requires local Docker and uses `postgres:17-alpine`. It creates a uniquely named, labeled container with ephemeral storage and a random localhost-only port, runs 14 real migration/grant/authorization/concurrency/photo tests and removes the container afterward. Normal `npm test` skips them unless `DATABASE_API_TEST_URL` is explicitly set. CI uses no AWS credentials.

## Preparation and future dev rollout

The steps below describe the original preparation sequence. The approved dev deployment is now automated by the dev-only scripts in [dev-rollout.md](dev-rollout.md). Do not repeat the old connection-only deployment or apply these steps to production without separate approval.

1. Create/configure a **dev Cognito user pool and app client**. Add resource server `studiostack-api` with scope `access`; allow that scope on the client. Use Authorization Code + PKCE for browser/mobile public clients, no embedded client secret. UF federation is separate coordination with UFIT.
2. Review the migrations and grants. With separately approved temporary, private maintenance connectivity, apply both migrations and the dev grants. `api-setup.ts` packages this fixed-purpose task: it requires `APPLY_DATABASE_API_SCHEMA=yes`, uses maintenance credentials and returns only migration names/status. Production also requires `ALLOW_PRODUCTION_SCHEMA=yes`. Do not leave a setup Lambda or master-secret access deployed; follow the cleanup pattern in the private deployment guide. No deployment command in this change performs this automatically.
3. Provision a real organization and its initial owner membership through reviewed maintenance/onboarding—not demo data or a public API. `POST /me` can create a profile but never grants organization access.
4. Obtain the public CA bundle if it is absent:

   ```sh
   mkdir -p .aws/database-lambda/certs
   curl --fail --location https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem -o .aws/database-lambda/certs/us-east-2-bundle.pem
   ```

5. Set the non-secret backend configuration in a reviewed local env file/shell, then run `npm run db:api:prepare`:

   ```text
   STUDIOSTACK_ENV=dev
   DATABASE_API_ID=vugf6fpl4k
   COGNITO_USER_POOL_ID=your-dev-pool-id
   COGNITO_APP_CLIENT_ID=your-dev-client-id
   ```

   Output is gitignored `.aws/database-api/runtime.zip`, `setup.zip`, dev/prod grant SQL, and (only with valid Cognito configuration) the environment's routes JSON. Preparation does not deploy or migrate anything.

6. After explicit deployment approval, update `studiostack-dev-database` with `runtime.zip`, handler `index.handler`, its existing dev role/VPC/group/app secret and the above API/Cognito variables. Preserve all connection/TLS variables. Set bounded reserved concurrency (initially at most 4, since the app login has a five-connection limit). No new runtime role, endpoint, NAT or database is needed. **Do not run the old connection-only `db:deploy` package afterward: it would replace API code/configuration.**
7. Review/deploy the route template to `studiostack-dev-api`. Every route requires JWT/access scope and matching API/method/path invocation permission. Rewire the existing dev photo route to the authorized database/photo handler; do not alter production. Verify stage/CORS settings. Never create a public Lambda function URL. This account has a 10-execution quota, so reserved concurrency is currently unavailable; dev has a 2-request/second, burst-4 stage throttle and a five-connection database login limit.
8. Test actual Cognito sign-in, token rejection, membership isolation, persistence and simultaneous bookings in dev. Dev Aurora resume can exceed the HTTP API integration timeout; warm up safely or return a retryable status, preserving the original reservation request ID. No automatic replay after an ambiguous response.
9. Only after verification, set `NEXT_PUBLIC_DATABASE_API_URL` and wire the client to a real `getAccessToken` provider and selected organization. The demo session cannot enable these APIs. Production needs its own pool/client/API IDs, explicit migration/deployment approval and a restore plan.

References: [API Gateway JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html), [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html), [official PostgreSQL container](https://hub.docker.com/_/postgres).
