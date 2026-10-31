# StudioStack operations and recovery

Use the AWS account and region configured for StudioStack, and distinguish the development and production resources before making changes. Never copy credentials into a ticket, chat, browser storage, or application logs. Confirm the responsible operator has access before an incident occurs.

## Monitoring and email

CloudWatch alarms publish to the `studiostack-operational-alerts` SNS topic. The approved operational recipient is `rmckenzie1@ufl.edu`; the recipient must confirm the SNS subscription before email can arrive. Check subscription status and alarm actions in the AWS console. The account budget is an early warning, not a spending limit. Investigate API errors, Lambda errors and throttles, database connection pressure, notification failures, and costs. The Lambda account quota was verified at 1,000 on October 30, 2026 UTC. Production capacity is bounded as described below; verify downstream capacity before raising it further.

The verified UF email address is the approved sender for now. SES production access alone does not guarantee inbox delivery: an email-address identity does not configure DKIM for the UF domain. Coordinate domain authentication with the domain owner, or use an appropriately verified domain when available. Monitor bounce and complaint events and suppression records; do not repeatedly retry rejected addresses.

## Database and secrets

RDS backups and point-in-time recovery protect database records. Restore to a separate private cluster first, verify the recovery time, schema, permissions and data, and separately review an application cutover. Do not overwrite the existing cluster or casually reverse applied migrations. RDS backups do not include uploaded object contents.

The application reads its restricted database login from Secrets Manager and refreshes cached credentials. Automatic rotation of that application credential is **not configured**. The RDS master secret is a separate credential and its rotation does not rotate the application login. Do not change only one side of the application credential: doing so can make the app unavailable. Use a reviewed, tested coordinated rotation with a rollback plan, least privilege, and no master-secret access for the runtime. Preserve the previous working secret version until the new login is confirmed and recovery is planned.

## Uploaded-file recovery

Private S3 photo buckets have versioning enabled. For an accidental overwrite or deletion, identify the environment, exact key, and intended historical version in S3. Retrieve that version and verify it in a controlled location before restoring it as the current version. Preserve existing versions and investigate the cause. Avoid bulk deletion or applying a lifecycle change during recovery. If the database record was also deleted or changed, recover or reconcile it separately: an object version alone does not restore its database reference.

The disposable drill `node --import=tsx scripts/test-file-recovery.ts --apply-dev` checks private version recovery after an overwrite and delete and removes only its uniquely named test objects. The `--apply-prod` variant uses a separate disposable fixture in production. These drills are not a substitute for monitoring retention and testing a full database-and-object recovery plan.

Before implementing automatic rotation, validate the exact AWS rotation contract and endpoint permissions against the current deployment. A candidate must stage a new restricted login, test it over TLS before promoting the pending secret, handle retries without replaying application writes, and retain a tested rollback path. The runtime caches credentials for up to one minute, so retirement must account for in-flight requests and cached connections. Ensure a future schema bootstrap accepts the rotated identity and that inherited grants preserve tenant isolation. Do not enable a schedule until failure, rollback, overlapping-rotation and recovery cases pass against a disposable database and development environment. See [AWS rotation function guidance](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotate-secrets_lambda-functions.html) and [rotation strategies](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotation-strategy.html).

## Workspace loading

Check browser request counts as well as database resume time when investigating slow pages. Initial cache snapshots must remain stable for a mounted workspace: writing a refreshed snapshot must not restart the loading effect. All component tests now exercise the production cache path, with snapshots cleared between tests. Production and Inventory cover the prior fetch loops; Production also covers usable cached content while revalidation is pending. Account bootstrap, sign-in, sign-out and preview entry clear snapshots across identities. Browser database requests have a 15-second read deadline (including retry backoff) and a 30-second mutation deadline; writes are not automatically retried. After a mutation timeout, refresh to check persisted state before repeating the action.

Navbar links must retain their DOM identity while the account menu opens or dismisses. Do not declare a nested navigation component inside Header: remounting on pointer-down can remove the clicked anchor before its click fires. Header regression tests cover all destinations, account dismissal and mobile-menu updates.

The shared navbar uses Next client navigation to canonical trailing-slash static pages, retaining the mounted app shell and session between routes. The postbuild step prepares route-data aliases: both `/reports/index.txt` and `/reports.txt`, for example, must return the exported Flight data with a successful response. Next can request either form during client transitions; missing aliases previously stalled navigation. Do not replace client links with full-page navigation: that reruns session bootstrap and displays the startup screen on every click.

There is no artificial browser request spacing. Independent reads start immediately; identical pending GETs share a request only when URL, token and transport match. Completed responses are not retained by this request layer. Writes invalidate pending-read reuse before and after the mutation so post-write refreshes cannot attach to an earlier read.

Production reserves four concurrent database Lambda executions, below the restricted login's five-connection cap. Each invocation uses at most one connection. The HTTP API allows 10 requests/second with a burst of 12, including preflight traffic. `node --import=tsx scripts/configure-production-capacity.ts --apply-prod` validates account capacity, records previous settings, applies the runtime cap before the stage limits, and verifies readback. The API deployment uses the same policy. Reservations cap concurrency; they do not keep paid Lambda instances warm. This is bounded capacity, not a guarantee for unlimited simultaneous traffic; review duration, throttles and connection pressure before expansion.

Publish frontend-only changes with `node --import=tsx scripts/publish-production-web.ts --apply-prod`. Every build clears generated `out/` before export, adds required route-data aliases, and packages a new archive. Publication verifies every exported route's HTML and both route-data URL forms, plus referenced static assets, byte-for-byte against the local build. A stale build or an HTML fallback for route data fails verification. Calendar renders through its normal Next page; its selected date/view is saved as view state rather than keeping a second hidden route mounted in the app shell.

## CI/CD

- **Pull requests** run the full suite (`.github/workflows/test-suite.yml`): lint, application and AWS typechecks, unit and integration tests, the production build, and the database API against a disposable PostgreSQL container.
- **Push to `main`** runs the same suite, then publishes the website to development (`https://dev.dvmmztb0u3m9g.amplifyapp.com`) with `scripts/publish-web.ts --apply-dev`. API, Lambda and database changes are still deployed manually.
- **Production** is released only from **Actions → Release Production → Run workflow** on `main`, typing `release`. The run stops unless the `production` environment requires reviewers, reruns the suite, and waits for an approver before publishing and byte-verifying every route.
- CI uses short-lived GitHub OIDC credentials. The `studiostack-ci-dev-web` and `studiostack-ci-prod-web` roles can only publish to their own Amplify app, and only from the matching GitHub environment. Create or update them locally with `node --import=tsx scripts/configure-ci-deploy-roles.ts --apply`.
- A repository admin must keep required reviewers on the `production` environment (Settings → Environments). Without them, releases refuse to run.
