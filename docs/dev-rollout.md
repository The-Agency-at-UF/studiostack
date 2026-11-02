# Development backend rollout

## Scope and approval

Approved October 13, 2026: development only, existing 13 database endpoints plus private photos. No production schema, Lambda, API or permission rollout; no PR creation or Git push. Temporary synthetic accounts/fixtures and migration access are permitted. The temporary database restore test has a $5 approved test budget in addition to normal dev usage.

This is an API MVP, not completion of every StudioStack feature. The website still uses its preview session/store. UF SSO, frontend persistence wiring, production rollout, tenant provisioning, reports, checkout/return, notifications and mobile integration are separate work.

## Deployed configuration

- `studiostack-dev-auth`: Cognito Lite user pool `studiostack-dev-users`, public-signup disabled, public web client (no client secret), Authorization Code + PKCE, scope `studiostack-api/access`. Synthetic credentials are held in memory, never in Git or logs. UF federation is not configured here.
- `studiostack-dev-api` (`vugf6fpl4k`): 16 JWT/scope-protected routes, exact dev Cognito issuer/client, `$default` auto-deploy. CORS allows only localhost ports 5174 and 5417. Dev throttle: 2 requests/second, burst 4.
- `studiostack-dev-database`: Node.js 24 arm64, 1024 MiB, 28-second execution timeout; 18-second database connection timeout, TLS/CA verification, five-connection restricted PostgreSQL login. Connections close before return so Aurora can pause.
- `studiostack-dev-db`: Aurora PostgreSQL Serverless v2 17.9, encrypted, private connections, existing 0–1 ACU auto-pause configuration and seven-day backups unchanged. Schema migrations 001–003 applied to dev only.
- `studio-stack-photos-dev`: all four Block Public Access settings retained. Exact-sized, five-minute POSTs land under `staging/{organizationId}/`. Lambda checks actual JPEG/WebP signatures, dimensions and decoded content, re-encodes to stripped JPEG, and saves private keys under `photos/{organizationId}/`. Only an active member can obtain a 60-second URL for an attached, completed inventory photo.
- Shared-VPC S3 gateway endpoint on the existing main route table; endpoint policy/HTTPS egress grants only the dev backend's photo prefixes. Existing production database roles/egress remain unchanged. No NAT gateway or new paid interface endpoint was added.
- Dev runtime IAM has object Get/Put only for its staging/photo prefixes, its own app secret via the existing private Secrets Manager endpoint, and scoped logging/network attachment permissions. No master-secret access or persistent migration Lambda is required at runtime.

The account-wide Lambda concurrency quota is 10; AWS won't permit a four-execution reservation while retaining its required unreserved minimum. Stage throttling and the database login cap are safeguards, not a substitute for future capacity planning. Quota increases and production performance tuning require separate review.

## Reproducible commands

Run only after reviewing the generated infrastructure/code and confirming the same dev approval:

```sh
npm run typecheck
npm run test:database
npm run test:database:postgres
npm run db:api:prepare
node --import=tsx scripts/deploy-dev-foundation.ts --apply-dev
node --import=tsx scripts/deploy-dev-api.ts --apply-dev
node --import=tsx scripts/test-dev-api.ts --apply-dev
node --import=tsx scripts/test-dev-restore.ts --apply-dev
```

The CLI account/profile is explicitly checked. `.aws/dev-rollout` contains ignored generated templates and non-secret evidence/manifests; `.aws/database-api` contains the public RDS CA and Lambda packages. No AWS access keys, Cognito tokens, synthetic passwords or database credential values are written there. Code packaging uses a fresh directory and Linux arm64/glibc Sharp binaries; never ship macOS native modules.

Deployment applies transactional, checksummed migrations through a temporary IAM-only maintenance Lambda. Its role/endpoint master access is removed in `finally`. Credential reads denied during IAM/endpoint propagation may retry **before any SQL starts**; ambiguous writes and invocations are never replayed automatically. Applied migration checksum differences abort rather than overwriting history.

`test-dev-api.ts` uses three admin-created synthetic accounts and actual OAuth Code+PKCE tokens. It tests all thirteen routes, token misuse, organization/admin restrictions, idempotency/conflicts, private photo bytes and signed/unsigned S3 access. Accounts are removed afterward. Only isolated fixture records/photos remain long enough for backup verification. A failed run leaves an exact cleanup manifest; `cleanup-dev-verification.ts --apply-dev` removes only that run's validated fixtures.

## Restore drill and recovery

The drill waits until `LatestRestorableTime` includes the verified fixture checkpoint. It creates a new private, tagged `studiostack-dev-restore-{runId}` cluster and exactly one `db.serverless` writer, capped at 1 ACU. It does not replace the source database or connect production. Using the restored restricted app login, verification checks TLS, application columns, counts and hashes for synthetic users, organizations, groups, inventory, reservations and photo records.

The temporary writer/cluster is removed after verification, with exact identifier/tag ownership guards, then source fixtures/photos and temporary maintenance permissions are removed. Source automated backups remain recoverable for their original retention period. Cluster creation has a 15-minute wait limit and writer creation a 30-minute limit; deletion is explicitly verified. AWS billing is delayed, so the budget is not a claim of final billed cost. Inspect any failed cleanup immediately.

## Verification evidence

Live development API/photo verification passed **43 checks** on October 13, 2026. These cover every database route, real Cognito Code+PKCE login and access scope, ID/tampered token rejection, admin/member/other-organization boundaries, reservation idempotency and conflict/cancellation, private photo POST/completion/attachment/download, stripped metadata, spoofed-format rejection and exact-size enforcement. All synthetic Cognito accounts were removed.

The restore drill passed: the restricted restored app login verified TLS and matching application columns/counts/hashes for 3 users, 2 organizations, 3 memberships, 1 group, 1 inventory item, 1 reservation, 1 reservation-item association and 2 photo-upload records. The referenced display photo remained a private AES256-encrypted JPEG in S3. The temporary writer/cluster were confirmed removed at **2026-10-13 07:37:58 UTC** (3:37 AM Eastern). Their lifetime was about 22 minutes; this is not a billed-cost statement. Source synthetic records and test photos were subsequently removed. Temporary maintenance functions/roles and endpoint master-secret access were removed; the live dev schema, runtime grants and APIs remain.

The approved **development backend MVP** is verified: API, Lambda, application schema, private photos, scoped credentials/networking and database restore all have live evidence. This is not 100% of the entire project: production rollout, frontend persistence/login, real organization onboarding, app-secret rotation, production observability and other feature work remain distinct.

Local verification passes **244 unit/UI tests**, **14 Docker-backed PostgreSQL tests**, TypeScript, lint (no errors) and the static Next.js build. Existing frontend/tooling dependency audit findings remain outside this backend rollout; patched Sharp 0.35.5 is used for the uploaded-photo decoder. Production deployment and frontend authentication/persistence remain separate approvals/work.

For an actual incident: choose a verified restore point, restore to a **new private cluster**, validate schema/data/TLS and secret credentials, then obtain approval for backend endpoint cutover. Do not overwrite the source or point production at a test restore. Recent app-secret rotation can require the matching prior secret version/approved credential reset. RDS backups include S3 object **keys**, not S3 object contents; separate S3 retention/backup planning is needed before production.

## Remaining operational boundaries

- The stored app credential is read from Secrets Manager, but automatic rotation of that restricted login is not configured. The RDS-managed master secret's rotation is a different mechanism. Plan a coordinated app-login rotation/recovery procedure before production.
- Staging objects expire after one day. Ready photos unlinked from inventory are retained; no background deletion job or production retention policy is included in this MVP.
- Browser integration uses `src/api/privatePhotos.ts` with a real token-providing `createDatabaseApiClient`, then passes returned `photoId` to inventory create/update. The older `src/api/photos.ts` contract is not the new organization-scoped dev API contract.
- Unit/local tests, deployed resources, successful live HTTP tests and successful restore tests are distinct evidence. Do not claim 100% for production or the website based on the dev backend rollout.

References: [AWS JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), [Aurora point-in-time restore](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-pitr.html), [S3 gateway endpoints](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html), [Sharp Lambda packaging](https://sharp.pixelplumbing.com/install/).
