# Production release: briefs and calendar

The feature is developed and verified in development first. No production migration, IAM grant, API change, Cognito change or website deployment is performed by the development scripts.

## Prepared source and artifacts

- Migration `004_production_briefs.sql` is additive. The migration runner is transactional, checksummed and refuses changes to applied migrations.
- `databaseApiGrants('prod')` generates restricted production table/column grants.
- `databaseApiInfrastructure` generates all 30 JWT-protected routes after the production API/pool/client are explicitly supplied.
- `productionNotificationInfrastructure` validates environment, account-scoped artifacts, user pool, sender identity and HTTPS origin, and generates the outside-VPC sender, log signal subscription, recovery schedule and alarms.
- `db:api:prepare` creates Linux ARM64 runtime/setup archives and dev/prod grant SQL locally. It deploys nothing. The runtime/setup code includes the production workflow; setup copies the exact migrations.
- The frontend remains a static export. Build with the real production public OAuth/API values only after they are configured. A missing hosted sign-in configuration fails closed.

## Release inputs that must be supplied

1. Production Cognito pool/public client, approved callbacks/logout origins and `studiostack-api/access` scope. Enable `openid profile email aws.cognito.signin.user.admin` for sign-in and user-controlled email verification. UF federation is a separate UFIT integration; this feature does not claim it exists.
2. Production organization and initial administrator onboarding. Review memberships and explicitly assign Production leadership/ELT users; preview identities cannot be migrated as real accounts.
3. Production frontend origin/domain and matching API/S3 CORS origins.
4. Verified Agency-owned SES sender identity, SES production-access approval, monitoring ownership and bounce/complaint policy. Do not reuse a developer's personal sender as an institutional production identity without an explicit decision.
5. Production S3 access for the backend role to its own staging, photos and briefs prefixes, plus the existing private S3 network path. The current connection stack's photo extension is development-only. Add production prefixes/principal explicitly; do not broaden to arbitrary buckets or public access.
6. Reviewed restricted database credential rotation/recovery, database snapshots/PITR and independent S3 history retention/recovery. RDS backups do not contain object bytes.

## Release procedure

1. Pin the reviewed commit and run typecheck, lint, unit/UI tests, disposable PostgreSQL tests and the production build. Review schema and role changes.
2. Record current production Lambda code/configuration, API routes, CORS and resource policies for rollback. Verify production backup retention and restore a recent backup to a separate private cluster if recovery has not been tested.
3. Generate fresh packages and route/grant templates. Obtain explicit production rollout authorization. The existing generic production migration requires `--apply --allow-production`; the development deployment scripts intentionally refuse production.
4. Apply reviewed migrations and production grants using temporary maintenance credentials over the existing private network. Remove the maintenance function/role and endpoint master-secret permissions in a `finally` cleanup. Never give runtime master-secret access.
5. Deploy the production API Lambda and JWT routes with explicit production API/pool/client IDs; preserve unrelated Lambda configuration/routes. Do not install the old connection-only package over the API runtime.
6. Deploy the sender using `productionNotificationInfrastructure({environment:'prod', ...})` with the production bucket artifact, verified identity and frontend URL. Its IAM policy must reference only the production backend function, production user pool and chosen SES identity.
7. Deploy the static frontend with production public values; configure exact origins. Set `PRODUCTION_EMAIL_ENABLED=yes` on the API only after sending is ready.
8. Verify real member/admin/reviewer/ELT accounts, denied cross-tenant access, draft/save/submit/review/resubmit, confirmed calendar dates, attachments, notification status and email receipt. Synthetic tests must use explicitly isolated production-safe fixtures and cleanup approval; the current live test script is development-only.

## Rollback and operating limits

Prefer rolling application code forward. If rolling back, keep the additive tables/history and disable the decision signal/recovery schedule before reverting API/frontend code. Restore prior Lambda/API configuration only from recorded evidence. Do not drop new tables or reverse a production schema change casually. Any database restore uses a new private cluster and requires a separately reviewed cutover; S3 object recovery is separate.

Review the account's low Lambda concurrency quota, dev throttles and database connection limits before production traffic. The database currently opens/closes one connection per operation. Monitor connection pressure, API latency, pending/uncertain delivery age, Lambda errors, object growth and actual service costs. CloudWatch alarms are created without an invented notification recipient; attach the approved operational destination before launch.
