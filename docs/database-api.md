# Authenticated database API MVP

This PR adds thirteen endpoints for profiles, organization membership reads,
organization-local groups, inventory and reservations. It builds on the private
[Aurora foundation](aurora-databases.md). It does not deploy or migrate production,
connect the preview website to live data, or add photo endpoints.

All routes require a Cognito access token with the `studiostack-api/access` scope.
API Gateway checks the issuer/audience/signature/expiration; handlers additionally
check the expected API, token type, client and scope. Organization permissions come
from active database memberships, never email domains, demo flags or request roles.

Use `/organizations/{organizationId}` as `{prefix}` below.

| Method/path | Purpose |
| --- | --- |
| `GET /me` | Current registered profile |
| `POST /me` | Idempotent registration/display-name update; no membership grants |
| `GET /organizations` | Caller’s active organizations |
| `GET {prefix}/members` | Admin-only membership read |
| `GET {prefix}/groups` | Member group read |
| `POST {prefix}/groups` | Admin group creation |
| `GET {prefix}/inventory` | Member inventory read |
| `POST {prefix}/inventory` | Admin equipment creation |
| `PATCH {prefix}/inventory/{itemId}` | Admin equipment update |
| `GET {prefix}/reservations` | Own bookings; admins see organization-wide bookings |
| `POST {prefix}/reservations` | Atomic, idempotent booking |
| `GET {prefix}/reservations/{reservationId}` | Authorized booking read |
| `POST {prefix}/reservations/{reservationId}/cancel` | Idempotent cancellation retaining history |

Migration `002_inventory_and_reservations.sql` adds inventory/reservations,
composite tenant foreign keys, nullable profile email and row-level security on
five tenant tables. Runtime grants exclude schema changes, membership edits and
hard deletion. Migration checksums must remain unchanged after application.

Bookings lock equipment in stable UUID order and serialize request IDs. Overlapping
confirmed bookings conflict; adjacent intervals are allowed. Reuse the original
request ID after an ambiguous network response. Neither helper nor handler replays
writes automatically. Lists are bounded/paginated and inputs reject unknown fields.

## Verification and preparation

```sh
npm run typecheck
npm run test:database
npm run test:database:postgres
npm run build
```

The PostgreSQL runner requires Docker, creates a uniquely named disposable local
PostgreSQL 17 container, and removes it afterward. It never connects to AWS. CI
uses the same tests without cloud credentials. Ordinary `npm test` skips these
integration tests unless `DATABASE_API_TEST_URL` explicitly targets the disposable
localhost database.

`npm run db:api:prepare` generates ignored local Lambda packages, migration grants
and an optional JWT route template. First download the public Ohio RDS CA bundle
to `.aws/database-lambda/certs/us-east-2-bundle.pem`. Preparing code is not deployment.
Explicit Cognito configuration and separately reviewed migration/deployment are
required. A later PR records the approved dev-only rollout and recovery evidence.

Not included: invitations, member/group membership edits, tenant onboarding,
checkout/return, reports, notifications or production activation.
