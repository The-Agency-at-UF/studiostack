# Production briefs and calendar

Production is a persistent, organization-scoped workspace at `/production/`. It implements the Production Brief Template supplied October 27, 2026 and the Client Services → Production leadership → Executive Leadership Team workflow.

## People and permissions

AWS IAM grants service access to Cognito, Lambda, S3 and PostgreSQL credentials. Human permissions come from trusted Cognito identity and active database memberships. Browser flags, email domains and preview roles do not grant access.

- Active organization members create, edit and submit their own briefs.
- Organization owners/admins manage Production leadership and Executive Leadership Team membership in **Access & notifications**. Admins can inspect organization records but do not automatically become reviewers.
- Explicit Production reviewers read submitted requests, leave section comments, approve, request changes, deny and reschedule.
- Explicit ELT members read submitted briefs and their decisions. Drafts are visible only to the author and organization administrators. Previously submitted, withdrawn records retain their review history for leadership and ELT.
- Review access and ELT membership do not change a person's organization-wide role.

The first development owner is provisioned through the explicit IAM-only bootstrap script. Additional existing organization members can be selected in the app. General self-signup and organization invitation management remain outside this production-workflow feature; Cognito is invitation-only.

## Briefs and dates

The guided form covers request details, project overview, creative direction, deliverables, on-site production, post-production, music/assets and timeline. On-site questions apply to photography/videography; post-production questions apply to editing/motion graphics. Drafts can be incomplete. Submission validates required fields and requires all pending attachments to be completed or discarded.

State transitions:

- Draft → Submitted.
- Submitted → Approved, Changes requested, Denied or Withdrawn.
- Changes requested → edited and resubmitted; submission count increases.
- Approved → rescheduled, Changes requested or Withdrawn.
- Denied/Withdrawn → reopened as a draft by its author.

Only authors edit draft/change-requested content. Submitted/approved content is frozen. Denial and requested changes require reasons; comments can target a brief section. Every save/action uses an optimistic version. Concurrent conflicting writes return 409, and request IDs make retries idempotent. There are no automatic write retries after an ambiguous network response.

**Approval confirms shoot dates**, as requested. A proposed date range becomes an inclusive all-day shoot window. A month-only estimate is allowed on submission but needs concrete dates before an on-site brief can be approved. Reviewers can choose a different range when approving. Editing-only requests can be approved without a shoot. Changing an approved brief back to Changes requested or withdrawing it clears confirmation. Approval does not book equipment.

Calendar dates are all-day UTC date boundaries to avoid shifting dates between time zones. The API additionally supports explicit timestamp offsets. The UI displays confirmed shoots, tentative windows, delivery and review milestones. Month-only shoot estimates appear under Awaiting shoot dates.

## History and attachments

Activity is append-only at the restricted database role. Submission and review snapshots preserve brief data, recorded shoot dates and attachment metadata. Previous snapshots remain available after resubmission.

Private attachments accept PDF, JPEG, PNG and WebP, up to 20 MiB each, 20 active attachments per brief. Browser uploads use five-minute exact-size policies scoped to staging keys. Completion validates length, MIME and file signatures and copies a pinned ETag to a separate private final key; reusing a staging upload cannot overwrite the final file. Download URLs expire after 60 seconds and use attachment disposition. Format signatures do not constitute malware scanning. Files are delivered as downloads, not embedded active documents.

Authors can remove attachments while editing. Removal is logical; files referenced by historical snapshots remain available through authorized historical downloads. Staging expires with the existing one-day lifecycle. Final file retention follows brief history; no automatic destructive retention job is installed.

## Decision notifications

A decision and its outbox jobs commit in one PostgreSQL transaction. Recipients are the brief author plus active, administrator-assigned ELT members, deduplicated by user ID. No manually maintained recipient-address list is used.

The outside-VPC sender resolves the stable account subject with Cognito `ListUsers`, then reads the current verified sign-up email with `AdminGetUser` using its actual username. It checks the exact pool/subject and account status, and sends plain-text SES email with the decision, reviewer, comment, revision, dates and a direct brief link. Users can verify their sign-up email from Production; no passwords or verification codes are stored in application data.

The private database Lambda has no outbound SES dependency. After a committed decision, a metadata-only CloudWatch log signal wakes the sender. A scheduled sweep recovers pending work (hourly in development; every five minutes in the prepared production template). The signal contains no brief or identity data.

Leases plus `FOR UPDATE SKIP LOCKED` prevent concurrent workers from claiming the same job. Explicit throttling rejections retry with backoff, up to five attempts. Unknown send outcomes and expired leases become Uncertain rather than being resent silently. Admins can explicitly retry Failed/Uncertain jobs; the UI warns that uncertain delivery may already have reached the recipient. SES acceptance is recorded as Sent; it is not proof of inbox receipt. Bounce/complaint processing is a later operational integration.

The Decisions & delivery view shows delivery state. Logs contain counts and generic failures, not addresses, tokens or brief text. CloudWatch alarms cover sender errors and recorded delivery failures.

### Development email constraints

Development uses `rmckenzie1@ufl.edu` as the verified SES sender, as authorized by Roger. This is a development identity, not a production sender decision. SES is currently in its sandbox in us-east-2: real recipient addresses also need SES verification, or the account must receive SES production-access approval. Cognito verification alone does not remove the SES sandbox restriction. The verified development administrator can receive test decision emails. Do not invite or message other people merely to test this feature.

## Backend routes

All HTTP routes use the existing JWT authorizer and `studiostack-api/access` scope. Prefix: `/organizations/{organizationId}/production`.

| Method/path | Purpose |
| --- | --- |
| GET `/access` | Current user's production permissions |
| GET/PATCH `/settings` | Admin-managed reviewer and ELT membership |
| GET/POST `/briefs` | Paginated visible briefs / create draft |
| GET/PATCH `/briefs/{briefId}` | Details/history / versioned draft save |
| POST `/briefs/{briefId}/actions` | Submit, comment, approve, request changes, deny, withdraw, reopen, schedule |
| POST `/briefs/{briefId}/attachments` | Authorize private upload |
| POST `/briefs/{briefId}/attachments/{attachmentId}/complete` | Validate and finalize upload |
| GET/DELETE `/briefs/{briefId}/attachments/{attachmentId}` | Authorized download / logical removal |
| GET `/deliveries` | Privileged delivery-status listing |
| POST `/deliveries/{deliveryId}/retry` | Explicit admin retry |

The outbox task is an IAM-only Lambda invocation and is never registered as a public HTTP route. Migration 004 adds organization RLS, foreign keys, restricted column grants and production-workflow tables. It does not alter legacy reservation data.

## Local verification and deployment

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:database:postgres
npm run build
```

PostgreSQL verification uses a fresh disposable localhost container and removes it. Preview data stays in a separate browser-local store and never becomes cloud authorization. Authenticated API failures never fall back to preview data.

Development deployment uses the existing guarded account/profile and private migration procedure:

```sh
npm run db:api:prepare
npm run production:deploy:dev
node --import=tsx scripts/bootstrap-production-admin.ts --apply-dev
npm run production:web:dev
PRODUCTION_EMAIL_FROM=rmckenzie1@ufl.edu PRODUCTION_EMAIL_IDENTITY=rmckenzie1@ufl.edu npm run production:notifications:dev
node --import=tsx scripts/test-production-dev.ts --apply-dev
```

Private ignored `.aws/dev-rollout/` metadata and the public RDS CA must be present. API deployment runs migration 004 under a temporary maintenance role, then removes maintenance access and deploys 30 protected routes. Hosting creates a separately tagged development Amplify app, builds a static export with public dev OAuth configuration, and registers only its exact callback/logout/CORS origins. Existing callback/CORS entries are preserved by the hosting script.

The approved admin invitation uses Cognito's email delivery; the administrator completes the initial password change themselves. Never place temporary passwords in chat, Git, logs, config files or frontend builds.

The live test script creates isolated synthetic Cognito accounts/organizations, tests HTTP authorization, lifecycle/history, private PDF bytes, approval dates and outbox persistence, then removes exact run-owned fixtures/accounts/objects. Non-secret evidence and cleanup manifests remain ignored. No production environment is changed by these commands.

## Production release preparation

See `production-release.md` before a production rollout. Development verification is not permission to migrate or deploy production. Choose real production identity providers, organization onboarding, hosting origins, sender identity, SES sending access and recovery/retention policy before enabling the prepared production deployment.
