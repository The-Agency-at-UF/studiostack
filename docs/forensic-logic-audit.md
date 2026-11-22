# StudioStack forensic application and business logic audit

### 1. Executive Logic Risk Matrix

| Audit Domain | P0 Critical | P1 High | P2 Medium | P3 Low | Primary Failure Pattern |
| --- | ---: | ---: | ---: | ---: | --- |
| State Machine, Lifecycle & Workflow Integrity | 0 | 4 | 1 | 0 | Physical custody and archive state diverge from permitted transitions |
| Data Invariants, Type Boundaries & Contract Drift | 0 | 1 | 2 | 1 | Versions, historical references, and schedule values lose meaning across boundaries |
| Concurrency, Race Conditions & Async Timing | 1 | 2 | 0 | 0 | Decisions use a stale read across a lock, transaction, or UI selection |
| Authorization, Isolation & Business Rule Bypass | 1 | 2 | 3 | 0 | Authorization at enrollment, pickup, or queue time outlives its purpose |
| Control Flow, Boolean Semantics & Failure Modes | 0 | 1 | 6 | 0 | Ambiguous outcomes, failed reads, and earlier delivery attempts overwrite valid state |
| Cross-Layer Synthesis & Gap Reconciliation | 1 | 2 | 2 | 0 | Recovery across systems can lose acknowledged writes or omit a promised result |
| **Verified total** | **3** | **12** | **14** | **1** | **30 findings, plus two conditional findings** |

Audited the StudioStack workspace at `a4dd560` on `feat/workspace-pagination-local`, including three existing untracked TypeScript files. Two duplicate tracked pagination files and the third has no importer in the active app. The review covered the hosted application, the local preview adapter, 31 migrations, background workers, and delivery and deployment scripts. The matrix counts each verified finding once under its primary lens. LOGIC-004 depends on mailbox reassignment and LOGIC-017 depends on enabled federation.

Local verification passed **718 standard tests**, **114 disposable PostgreSQL tests**, and type checking. Focused local checks confirmed the expanded return-event byte limit, DST conversion, outbox acknowledgment behavior, and preview split-write failure. The remaining findings are source-verified or explicitly conditional. Authorization scenarios are expressed as defensive regression assertions.

**Production database.** Saved rollout records confirm that production cut over on November 13, 2026 at 1:17 a.m. Eastern to `studiostack-prod-pg`, the RDS for PostgreSQL 17 `db.t4g.micro` instance. The original rollout checkout's `.aws/prod-rollout/rds-instance.json` records the cutover time, and `rds-cutover.json` records a successful data comparison and runtime switch. Its source was `studiostack-prod-db` on Aurora, retained at the time for rollback. Development uses its own Aurora cluster. The AWS CLI session had expired at follow-up, so the saved rollout records are the deployment evidence for this audit. `infra/database/rds-instance.ts:45-52`, `docs/rds-cutover.md:1-3,19-37`, `scripts/cutover-prod-to-rds.ts:48-68`.

### 2. Reconstructed Ground Truth & Invariant Map

#### Entity lifecycles

| Entity | States and transitions | Enforcement and dependencies |
| --- | --- | --- |
| Account and membership | Cognito account → application profile → onboarded after an active membership. Membership roles are owner, admin, and member. Membership states are invited, active, and suspended. Active membership can originate from invitation, approved request, configured domain/code join, or provisioning. Suspension can be reversed through an authorized membership update or eligible invitation. Self-deletion suspends memberships and clears profile details before provider deletion. | Issuer and subject identify the application profile. Active membership gates tenant access. Owner changes are subject to the last-owner rule. `backend/database/api-repository.ts:59-95`, `backend/accounts/directory.ts:25-79`, `backend/accounts/repository.ts:57-75`, `backend/database/migrations/001_identity_and_groups.sql:4-30` |
| Invitations, access requests, and join methods | Pending invitations can be accepted, revoked, or expire. Effective expiry is checked by timestamp. Access requests move from pending to approved, denied, or withdrawn. A join code is usable until revoked, expired, or exhausted. Owners can add, update, and remove domains. | Invitation acceptance binds a verified provider email. Code redemption serializes consumption. Access request history has decision attribution. `backend/accounts/directory.ts:25-52`, `backend/accounts/onboarding.ts:11-23,51-103`, `backend/accounts/join-methods.ts:34-99`, `backend/database/migrations/005_account_administration.sql:8-32`, `backend/database/migrations/011_onboarding_join_methods.sql:7-68` |
| Inventory, reservation, and checkouts | Inventory is available, maintenance, or retired. Reservation is confirmed or cancelled. Its fulfillment is reserved → checked out → returned. Cancelled and returned end fulfillment, while missed and overdue are time-derived states. Checkout rows track one item and are open or returned. Damage on return opens a high report and moves equipment into maintenance. | Creation and edits serialize per equipment and use half-open overlap; checkout serializes per equipment and uses a unique open checkout per item. A checked-out booking keeps its start and items. `backend/database/api-repository.ts:131-196`, `backend/equipment/repository.ts:19-51`, `backend/database/migrations/002_inventory_and_reservations.sql:5-49`, `backend/database/migrations/006_equipment_workflows.sql:4-34` |
| Equipment report | Open, in progress, or resolved. Administrators can move between these states, including reopening. Resolving records notes, actor, and time. Reports and comments persist in the activity log. | A high open report ordinarily keeps gear in maintenance. Service restoration checks other high reports. `backend/equipment/reports.ts:10-46`, `backend/database/migrations/006_equipment_workflows.sql:36-75` |
| Production brief, schedule, crew, attachment | Draft or changes requested → submitted. Submitted → approved, changes requested, denied, or withdrawn. Approved → changes requested or withdrawn. Changes requested can also be withdrawn. Denied or withdrawn → draft on author reopen. Draft, denied, and withdrawn can be soft-deleted. A submitted or approved brief can have confirmed dates. Soft holds may be replaced. Crew assignments replace the current set after approval. Attachments move pending → ready or discarded, ready → discarded. | Versioned writes and event receipts guard most changes. Confirmed dates must be paired and ordered. Crew shifts are checked for overlaps and schedule changes can clear assignments. Attachment completion checks private bytes before recording readiness. `backend/production/repository.ts:138-305`, `backend/database/migrations/026_production_brief_delete_inactive.sql:10-17`, `backend/database/migrations/029_production_planning.sql:1-7` |
| Client account and production idea | Client active ↔ deleted, with linked history retained. Ideas use idea, pitched, selected, and archived. The handler accepts status changes among these values subject to actor and current selected status. Selected pitches can seed new drafts in the UI. | Lead/admin manages client names. Creator/admin can delete or restore. Authors manage their own unselected ideas. Lead/admin selects pitches. `backend/production/clients.ts:7-39`, `backend/production/ideas.ts:8-28`, `backend/database/migrations/031_production_ideas.sql:1-18`, `src/views/Production/IdeaBoard.tsx:14-18` |
| Photos, alerts, and delivery | Photo pending → ready; stale pending metadata can expire. Alerts are unread → read. Email starts pending or queued → sending → sent, failed, or uncertain, with retry to pending/queued after eligible errors. Some workers also use skipped or suppressed. Feedback can apply after a send acknowledgment. | Photo and file references are tenant-scoped. Jobs are leased and acknowledgments require the lease token. Email feedback also records recipient suppression. `backend/database/migrations/003_private_photos.sql:3-25`, `backend/database/migrations/007_app_alerts.sql:9-30`, `backend/database/leased-outbox.ts:9-47`, `backend/email/feedback.ts:10-34` |

#### Trust boundaries and authority

| Boundary or actor | Effective authority and enforcement |
| --- | --- |
| Browser routes, forms, QR, URL and stored state | Static Next.js renders React. Inputs become typed API calls, upload form data, or preview adapter mutations. Route and button visibility are client state. Hosted permissions come from the API. `next.config.mjs:1-7`, `src/components/AppShell.tsx:198-219`, `src/api/database.ts:31-82`, `src/views/Equipment/ScanHandoff.tsx:21-33` |
| Public HTTP ingress | JWT and scope at API Gateway; Lambda rechecks configured audience/client, issuer, access-token type and expiry, then dispatches allowlisted routes. Families cover profile/org, inventory/reservations, production, reports, photos, alerts, feedback submission, and organization administration. Separate account directory routes also resolve the caller through Cognito. `infra/database/api-resources.ts:15-39`, `backend/database/api.ts:27-115`, `backend/accounts/routes.ts:8-38`, `backend/accounts/worker.ts:14-55` |
| Nonmember with a registered identity | Can use own profile and the verified directory flows for invitations, organization search, domain/code join, or access requests. Active membership is required before marking onboarding complete or entering tenant operations. `backend/database/api-repository.ts:59-95`, `backend/accounts/worker.ts:34-55` |
| Active member | Reads tenant catalog, availability, active directory names/roles, shared nondraft production, organization reports, and own alerts. Manages own reservations and editable briefs, submits own briefs, authors ideas, files and comments on reports. Closed reservation history and production history have separate visibility rules. `backend/database/api-repository.ts:88-101,121-169`, `backend/accounts/repository.ts:24-30`, `backend/equipment/reports.ts:10-33`, `backend/production/repository.ts:24-60,194-224` |
| Production Lead / ELT | Lead reads organization booking detail, and can review, schedule, assign crew, select ideas, and manage client accounts within the separate delete rule. ELT reads production decision history and delivery state and receives decision notifications. Designation is stored per organization. `backend/database/api-repository.ts:94-95,148-164`, `backend/production/repository.ts:20-28,57-70,88-104,126-135,159-207`, `backend/production/clients.ts:7-10` |
| Admin / owner | Both manage inventory, report resolution, membership within role restrictions, and production review and settings. Owners alone manage domain policy and can change owner roles. The account updater forbids self-edits, rechecks authority after its organization lock, and preserves at least one active owner on its path. `backend/accounts/repository.ts:19-30,49-74`, `backend/accounts/join-methods.ts:29-37`, `backend/database/api-repository.ts:125-146`, `backend/equipment/reports.ts:20` |
| PostgreSQL, private S3, and workers | Tenant context is transaction-local. Composite references and row policies supplement per-action checks. Browsers upload to a signed staging policy; private Lambda verifies bytes and issues download URLs. IAM-only database tasks cover account directory, leased sends, feedback and retention. Event-driven signals and scheduled sweeps wake workers. Separate guarded maintenance and CI scripts provision, migrate, cut over, and publish. `backend/database/api-repository.ts:87-101,198-254`, `backend/database/api-entry.ts:36-59`, `backend/production/storage.ts:13-34`, `infra/production/notifications.ts`, `.github/workflows/release-production.yml:19-53`, `scripts/cutover-prod-to-rds.ts:24-68` |
| Local preview | Simulated identities, organization roles, receipts, alerts and storage run inside the browser. A per-tab queue serializes workspace mutations. Files use a separate browser store. These are workflow fixtures and carry no hosted privilege. `src/views/Equipment/live.ts:9-13`, `src/preview/workspace.ts:23-41`, `src/preview/storage.ts:1-14`, `src/preview/media.ts` |

The server rejects unknown fields on object-validated routes, malformed UUIDs and invalid offset timestamps, and duplicate reservation equipment IDs. PostgreSQL enforces enum checks, tenant composite keys, and one open checkout per item. Advisory and row locks coordinate competing booking writes. Source tracing confirmed that these protections apply to their named entry points. `backend/database/api-validation.ts:9-30,64-83`, `backend/database/api-repository.ts:171-196`, `backend/database/migrations/006_equipment_workflows.sql:26-34`.

A reservation marked returned should reflect the physical disposition of each item. Equipment availability depends on service status, custody, and time. Authority must be current when a privileged action becomes irreversible. A replay should return enough information to reconcile the original command. A database cutover must preserve every acknowledged write. These are the invariants tested by the ledger.

**Ambiguous / Undocumented Rules**

- The older brief workflow describes leadership-only review access and approval as the point when shoot dates are confirmed. The Agency and planning documents describe shared nondraft briefs and allow approval before a confirmed date or scheduling before approval. The current handlers implement the newer rules. Confirm which nondraft fields and attachments every member should see, especially for changed, denied, or withdrawn briefs. `docs/production-workflow.md:9-33`, `docs/agency-workspace.md:9-15`, `docs/production-planning.md:5-10`, `backend/production/repository.ts:24-32,57-60,201-207,264-272`
- The reservation rules define UTC instants with offsets. The form uses the device time zone, and the production calendar shows UTC all-day events even when soft holds were entered as timed local events. Confirm which organization time zone and duration semantics drive reporting, deadlines, and scheduling. `docs/database-api.md:47-51`, `src/views/Equipment/Reservations.tsx:165-188`, `src/views/Production/SoftHolds.tsx:5-12`, `src/views/Production/ProductionCalendar.tsx:17-44`
- The product calls for condition and missing-gear reporting on return; it leaves undefined who can certify a missing item, which remaining items can be released, and how borrowers regain booking eligibility when an open custody record cannot be physically closed. `docs/product-requirements.md:37-43`, `backend/equipment/repository.ts:37-49`
- Production decisions are addressed to active ELT members at enqueue. The repository does not document whether queued delivery survives removal from that role. Because the email body carries decision details, choose and document the authorization point before enabling historical retries. `docs/production-workflow.md:43-53`, `backend/production/repository.ts:65-70`, `backend/production/notifications.ts:12-17,66-74`

- The product requirements describe members following their own reports. The live reports UI and PostgreSQL tests allow organization-wide reporting and discussion. Decide whether members need full report and discussion access or only a service-status summary for equipment they can book. `docs/product-requirements.md:21,45-51`, `backend/equipment/reports.ts:10-27`, `src/api/database.postgres.test.ts:802-823`

### 3. Forensic Findings Ledger (Ordered P0 → P3)

#### [LOGIC-001] Returning the production runtime to Aurora can strand acknowledged RDS writes
- **Severity:** P0 | **Confidence:** [VERIFIED]
- **Domain:** Cross-Layer Synthesis & Gap Reconciliation
- **Type:** Broken Logic
- **Location:** `scripts/cutover-prod-to-rds.ts:41-68`, `scripts/prod-rds.ts:5-15`, `scripts/production-database.ts:7-18`, `docs/rds-cutover.md:21-36`
- **Violated / Missing Invariant:** Once public writes are admitted on RDS, every acknowledged write must remain visible after recovery.
- **Execution Trace:**
  1. `scripts/cutover-prod-to-rds.ts:45-57` — Freeze writes, copy and verify Aurora, then switch the runtime to RDS.
  2. `scripts/cutover-prod-to-rds.ts:58-60` — Unfreeze the public runtime before the diagnostic and cutover record succeed.
  3. `scripts/cutover-prod-to-rds.ts:61-68` — Either later failure sends the runtime back to Aurora without freezing, draining, or applying RDS writes. A failed waiter after an accepted configuration update can also leave the actual target unknown because the local switch flag is set only after the waiter.
  4. `scripts/prod-rds.ts:5-15` and `scripts/production-database.ts:7-18` — Later API deployments rely on a checkout-local cutover record to select RDS. If that record is missing and the legacy Aurora cluster still passes validation, the deployment can select Aurora again.
- **Adversarial Reproduction:** In a mocked deployment, admit one write immediately after the concurrency restore and fail the subsequent diagnostic or metadata write. Separately inject an accepted config update with a waiter timeout, and test an API redeploy from a checkout without local cutover metadata against an already migrated runtime.
- **Blast Radius:** A cutover failure or later reversion to the legacy cluster can leave acknowledged RDS writes absent from the active database. The saved November 13 cutover record reports successful completion.
- **Surgical Fix:** Probe the target through a private candidate while public writes stay frozen. Persist the verified target and phase in shared deployment state and make subsequent deployments validate the live target before changing it. Resolve ambiguous control-plane results against actual configuration. Once writes reopen, make failures roll forward or require an explicit drain and verified reverse reconciliation.

#### [LOGIC-002] Account deletion can suspend the last organization owner
- **Severity:** P0 | **Confidence:** [VERIFIED]
- **Domain:** Concurrency, Race Conditions & Async Timing
- **Type:** Broken Logic
- **Location:** `backend/accounts/directory.ts:57-71`, `backend/accounts/repository.ts:19-22,57-69`, `backend/database/migrations/001_identity_and_groups.sql:22-30`
- **Violated / Missing Invariant:** Every organization with an active owner must retain one after any account or membership mutation.
- **Execution Trace:**
  1. `backend/accounts/directory.ts:61-64` — Deletion selects membership roles before acquiring the organization administration lock.
  2. `backend/accounts/repository.ts:19-22,57-69` — Owner promotion can commit under that lock while deletion holds a stale role in memory. Another owner can then legitimately depart.
  3. `backend/accounts/directory.ts:65-71` — The stale role bypasses the last-owner check. Suspending the final owner leaves no app actor able to exercise owner-only controls.
- **Adversarial Reproduction:** A PostgreSQL concurrency regression should assert that promotion and competing owner departures leave at least one active owner under every barrier ordering.
- **Blast Radius:** Owner-only actions become unavailable for the affected organization until maintenance restores ownership.
- **Surgical Fix:** Re-read current membership role and status while holding the organization lock. Share one transactional owner-preservation guard across every suspension, retirement, handover, and account rebind path. Serialize against concurrent membership creation where deletion enumerates organizations.

#### [LOGIC-003] Decision email eligibility outlives Production ELT access
- **Severity:** P0 | **Confidence:** [VERIFIED]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Missing Logic
- **Location:** `backend/production/repository.ts:65-70,92-104`, `backend/production/outbox.ts:15-23`, `backend/production/notifications.ts:12-17,25-41,66-74`, `backend/alerts/outbox.ts:9-12`
- **Violated / Missing Invariant:** A decision email with restricted content requires current eligibility as an active brief author or current active ELT recipient.
- **Execution Trace:**
  1. `backend/production/repository.ts:65-70` — The transaction stores the current author and ELT recipients with a payload that includes decision comments.
  2. `backend/production/outbox.ts:17-22` — The claim checks active membership but never rechecks the current ELT list. A claimed job also retains its delivery data after suspension.
  3. `backend/production/notifications.ts:66-74` — Verified provider address and suppression checks proceed to SES without an application permission check. Email can disclose the payload to a former recipient.
- **Adversarial Reproduction:** In a mocked sender regression, assert no provider send after ELT removal before claim or membership suspension before delivery authorization.
- **Blast Radius:** Confidential project, client, review, and schedule data in queued or manually retried decision email on deployments running the sender. Delivered mail is irretrievable.
- **Surgical Fix:** Revalidate author/ELT eligibility, active membership, and current lease at claim and immediately before sending. Record revoked jobs as skipped and require the same guard on manual retries.

#### [LOGIC-004] Reassigned mailbox can inherit a previous person's organization authority
- **Severity:** P0 | **Confidence:** [CONDITIONAL]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Missing Logic
- **Location:** `backend/accounts/worker.ts:34-35,47-53,69-71`, `backend/database/migrations/017_unique_account_email.sql:37-63`, `backend/database/api-repository.ts:68-93`, `src/api/database.postgres.test.ts:1098-1112`
- **Violated / Missing Invariant:** Recovering a privileged application user requires continuity of the person or an approved transfer of authority.
- **Execution Trace:**
  1. `backend/accounts/worker.ts:34-35,47-53` — The directory obtains the verified email and a reported presence state for the existing account's subject.
  2. `backend/database/migrations/017_unique_account_email.sql:54-63` — When the previous sign-in is reported deleted and the new profile can be dropped, the function rebinds the old application user ID to the new subject.
  3. `backend/database/api-repository.ts:68-93` — The next request resolves that user ID and inherits its memberships, including owner/admin roles.
- **Adversarial Reproduction:** A defensive identity-continuity test should assert that distinct synthetic principals with the same verified address cannot inherit existing privileged memberships without explicit approval.
- **Blast Radius:** Every organization tied to the old user ID if the configured identity provider reassigns a mailbox between people and reports the old subject absent. Confirm institutional address-reuse policy and configured identity sources to establish exposure.
- **Surgical Fix:** Require identity continuity proof or per-organization approval to rebind historical membership. Preserve business records under the old user ID and provision a separate profile for a reassigned address.

#### [LOGIC-005] Approval can overwrite a committed access-request withdrawal
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Concurrency, Race Conditions & Async Timing
- **Type:** Broken Logic
- **Location:** `backend/accounts/repository.ts:19-23`, `backend/accounts/join-methods.ts:29-33,89-100`, `backend/accounts/onboarding.ts:98-103`
- **Violated / Missing Invariant:** A pending request can leave pending once. Membership creation requires a winning approval transition.
- **Execution Trace:**
  1. `backend/accounts/join-methods.ts:89-91` — Admin reads pending status and version without locking the request row.
  2. `backend/accounts/onboarding.ts:98-103` — Applicant withdraws through an independent conditional update.
  3. `backend/accounts/join-methods.ts:92-100` — The admin path can add membership and then update the already-withdrawn row without a status or version predicate.
- **Adversarial Reproduction:** A barrier-based test should assert that a committed withdrawal cannot be overwritten by an in-flight decision, and cannot produce a membership or approval audit event.
- **Blast Radius:** One applicant and organization per conflicting decision. Both participants may receive success for contradictory outcomes.
- **Surgical Fix:** Lock the request row before checking pending/version or use a conditional update with RETURNING as the first transition. Create membership and audit the decision in the same transaction after the winning update.

#### [LOGIC-006] Failed Cognito deletion leaves a partially deleted account
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** State Machine, Lifecycle & Workflow Integrity
- **Type:** Missing Logic
- **Location:** `backend/accounts/worker.ts:21-32,55-56`, `backend/accounts/directory.ts:57-97`, `backend/database/api-repository.ts:59-75`, `backend/database/migrations/017_unique_account_email.sql:37-44`
- **Violated / Missing Invariant:** A cross-system deletion must have a durable pending or complete state and a safe recovery path.
- **Execution Trace:**
  1. `backend/accounts/directory.ts:57-79,82-86` — PostgreSQL commits suspension, request withdrawal, and profile scrubbing.
  2. `backend/accounts/worker.ts:29-32,56` — A subsequent Cognito failure returns 503 after the database commit.
  3. `backend/database/api-repository.ts:59-75` — A still-valid identity can continue profile operations because the DB row has no deleting/deleted state. The verified directory can repopulate its email.
- **Adversarial Reproduction:** In a mocked account deletion, commit the database phase and have the provider call fail. Assert a durable pending state, blocked ordinary profile updates, and eventual completion on retry.
- **Blast Radius:** All organizations and pending requests for the relevant user. The old sign-in can survive while the user loses the memberships needed for normal use.
- **Surgical Fix:** Commit a deletion tombstone and provider deletion operation with local retirement. Gate both API paths for the subject, safely retry provider deletion, and treat confirmed provider absence as completion.

#### [LOGIC-007] Account retirement can revive a former Production designation
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Missing Logic
- **Location:** `backend/accounts/directory.ts:34-45,61-78`, `backend/accounts/repository.ts:69-74`, `backend/production/repository.ts:20-24`, `backend/database/migrations/014_prune_inactive_production_roles.sql:1-10`
- **Violated / Missing Invariant:** Removing membership revokes Production reviewer and ELT designations until they are explicitly granted again.
- **Execution Trace:**
  1. `backend/accounts/repository.ts:69-74` — Ordinary admin suspension prunes the designation arrays under a settings lock.
  2. `backend/accounts/directory.ts:61-78` — Self-deletion suspends memberships and leaves those arrays unchanged.
  3. `backend/accounts/directory.ts:34-45` and `backend/production/repository.ts:20-24` — If the subject survives partial deletion and later rejoins as an ordinary member, the old arrays confer reviewer or ELT authority again.
- **Adversarial Reproduction:** Assert in a defensive regression that an ordinary reinvitation following account retirement cannot reinstate a previous reviewer or ELT role.
- **Blast Radius:** Unintended access to review actions, organization booking detail, production history, or decision delivery in organizations that had designated the account.
- **Surgical Fix:** Centralize membership deactivation and designation pruning in the same transaction, including deletion and maintenance paths. Apply one organization/settings lock order.

#### [LOGIC-008] Client location is accepted as proof of a physical handoff
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Missing Logic
- **Location:** `src/api/location.ts:4-9`, `src/views/Equipment/Fulfillment.tsx:72-75`, `backend/equipment/validation.ts:8-9`, `src/types/campus.ts:3-6`, `backend/equipment/repository.ts:37-49`
- **Violated / Missing Invariant:** A verified physical handoff needs evidence of the event independent of a claim made by the browser submitting it.
- **Execution Trace:**
  1. `src/views/Equipment/Fulfillment.tsx:72-75` — The UI obtains browser geolocation and submits it as part of the handoff.
  2. `backend/equipment/validation.ts:8-9` — The server validates three numeric fields supplied by the caller. It receives no independently issued proof or observation timestamp.
  3. `backend/equipment/repository.ts:37-49` — Passing proximity and reservation checks advances physical custody and can free items for later bookings.
- **Adversarial Reproduction:** A negative regression should assert that an uncorroborated location claim alone cannot finalize physical checkout or return.
- **Blast Radius:** Inventory and custody history for a reservation the active borrower or administrator can fulfill.
- **Surgical Fix:** Require staff confirmation or a one-use short-lived handoff credential bound to the reservation, actor, and action. Use browser proximity as supporting context.

#### [LOGIC-009] Partial or missing-item returns have no valid state
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** State Machine, Lifecycle & Workflow Integrity
- **Type:** Missing Logic
- **Location:** `docs/product-requirements.md:37-43`, `src/views/Equipment/Fulfillment.tsx:59-75`, `backend/equipment/repository.ts:37-49`, `backend/database/migrations/006_equipment_workflows.sql:13-34`
- **Violated / Missing Invariant:** Custody and availability must describe the disposition of each item in a multi-item return.
- **Execution Trace:**
  1. `src/views/Equipment/Fulfillment.tsx:59-75` — The form collects condition for every reserved item.
  2. `backend/equipment/repository.ts:39-49` — The request must include the exact item set. Success closes every open checkout and marks the aggregate returned.
  3. `backend/database/migrations/006_equipment_workflows.sql:13-34` — The available transitions cannot distinguish a physically received item from a missing one.
- **Adversarial Reproduction:** Check out a camera and lens. Bring the camera back while the lens is missing. The normal return flow cannot release the camera while recording the lens as missing.
- **Blast Radius:** Returned gear can remain blocked indefinitely, or its missing counterpart can be recorded as returned. A borrower remains subject to the overdue gate while the aggregate stays checked out.
- **Surgical Fix:** Record received and missing dispositions per checkout, with authorized reason and audit. Release received gear independently, quarantine missing gear, and derive the reservation and borrower lock from unresolved custody.

#### [LOGIC-010] Separate equipment repair paths can restore archived or damaged gear
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Cross-Layer Synthesis & Gap Reconciliation
- **Type:** Broken Logic
- **Location:** `src/views/Equipment/Reports.tsx:78-81`, `backend/equipment/reports.ts:29-41`, `backend/database/api-repository.ts:131-146,185-191`, `backend/equipment/repository.ts:39-47`
- **Violated / Missing Invariant:** Bookable gear must pass the same serviceability rule regardless of where service is restored. Archive status changes require an explicit inventory transition.
- **Execution Trace:**
  1. `backend/equipment/reports.ts:38-41` — The repair action checks condition and other reports, then sets status available even for retired equipment.
  2. `backend/database/api-repository.ts:131-146` — Manual restore checks unresolved high reports but leaves stored condition unchanged. Resolving a damage report without repair lets the status become available while the condition remains damaged.
  3. `backend/database/api-repository.ts:185-191` and `backend/equipment/repository.ts:39-46` — Booking checks status. Fulfillment checks the newly submitted condition, allowing an inconsistent stored item to progress.
- **Adversarial Reproduction:** Resolve and restore a report on an archived fixture. Separately, resolve a damaged-return report without restoring service, then change service status in Inventory. Assert that neither sequence makes the item bookable without the proper transition.
- **Blast Radius:** Archived equipment reappears in circulation, or damaged gear becomes reservable for subsequent production work.
- **Surgical Fix:** Share the inventory row lock and a serviceability predicate across report restore, inventory status changes, booking, and checkout. Preserve retired status on report resolution and require recorded repair before restoring damaged gear.

#### [LOGIC-011] Early pickup can displace the current reservation
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** State Machine, Lifecycle & Workflow Integrity
- **Type:** Broken Logic
- **Location:** `backend/database/api-repository.ts:187-196`, `backend/equipment/repository.ts:26-27,37-45`, `backend/database/migrations/006_equipment_workflows.sql:26-34`
- **Violated / Missing Invariant:** Early pickup cannot take custody of equipment during an earlier active booking slot.
- **Execution Trace:**
  1. `backend/database/api-repository.ts:187-191` — Half-open overlap rules accept consecutive reservations for the same item.
  2. `backend/equipment/repository.ts:39-41` — The later booking enters the 15-minute pickup window. Its eligibility checks existing checkout rows but ignores the preceding active reservation.
  3. `backend/equipment/repository.ts:41-45` — Once the later checkout commits, the earlier borrower is blocked by the legitimate unique-custody guard.
- **Adversarial Reproduction:** Reserve a camera for 10–11 a.m. and 11 a.m.–noon. Attempt the second pickup at 10:46 and the first at 10:50.
- **Blast Radius:** The borrower who owns the current booking window can lose access to scheduled gear.
- **Surgical Fix:** Under existing equipment locks, reject early pickup when an earlier confirmed, unfulfilled booking spans server time for any requested item. Retain the physical custody check and test the exact boundary.

#### [LOGIC-012] Unversioned mutations overwrite or remove newer work
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Data Invariants, Type Boundaries & Contract Drift
- **Type:** Missing Logic
- **Location:** `src/views/Equipment/Inventory.tsx:125-127`, `backend/database/api-validation.ts:49-60`, `backend/database/api-repository.ts:131-146,155-169`, `backend/database/api.ts:100-102`, `src/views/Production/Production.tsx:205-209`, `backend/production/repository.ts:138-156`
- **Violated / Missing Invariant:** Changes and destructive confirmations must apply to the revision the actor reviewed.
- **Execution Trace:**
  1. `src/views/Equipment/Inventory.tsx:125-127` — Inventory sends the editor's full mutable snapshot without an expected version. The server locks the row and updates submitted values.
  2. `backend/database/api.ts:100-102` and `backend/database/api-repository.ts:155-169` — Cancellation accepts an empty body and cancels the current reserved revision.
  3. `backend/production/repository.ts:138-156` — Brief deletion checks current status and author/admin authority. The version requirement applies only to PATCH, so a stale delete can hide a newly saved draft.
- **Adversarial Reproduction:** Use two authorized tabs. Save an inventory category change from one and a stale name change from the other. Repeat with a booking edit before a stale cancellation, and a draft save before a stale delete confirmation.
- **Blast Radius:** Silent lost inventory edits, unexpected booking cancellation, or a newly saved brief hidden from normal reads.
- **Surgical Fix:** Carry expected version from the opened editor or confirmation, compare under the existing row lock, and respond 409 on mismatch. Inventory should send changed fields. Preserve duplicate completion semantics with a durable terminal-operation receipt.

#### [LOGIC-013] An abandoned administrator upload can block the brief author
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** State Machine, Lifecycle & Workflow Integrity
- **Type:** Missing Logic
- **Location:** `backend/production/repository.ts:25-27,194-199,245-287`, `src/views/Production/BriefUploads.tsx:18-23`
- **Violated / Missing Invariant:** An author able to submit a brief needs a recovery path for every pending attachment that blocks submission.
- **Execution Trace:**
  1. `backend/production/repository.ts:247-262` — An administrator adds a pending upload to another author's editable draft.
  2. `backend/production/repository.ts:264-287` — The author can see the attachment but cannot complete or discard it because they did not upload it.
  3. `backend/production/repository.ts:194-199` — Any pending attachment blocks submission, including after staging expires.
- **Adversarial Reproduction:** In a two-role fixture, interrupt an administrator's upload after the slot commits. Sign in as the author and assert there is a supported path to clear the blocker.
- **Blast Radius:** Affected drafts cannot be submitted without administrator intervention. Pending slots also count toward the file limit.
- **Surgical Fix:** Allow authors to discard pending files on their own editable brief, and add versioned expiry or abandonment for obsolete upload slots. Keep completion restricted according to uploader and administrator policy.

#### [LOGIC-014] A valid large return can exceed its own activity event limit
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Cross-Layer Synthesis & Gap Reconciliation
- **Type:** Broken Logic
- **Location:** `backend/database/api.ts:54-58`, `backend/equipment/validation.ts:6-9`, `backend/equipment/repository.ts:43-51`, `backend/database/migrations/006_equipment_workflows.sql:61-74`, `backend/database/api-repository.ts:241-252`
- **Violated / Missing Invariant:** A valid fulfillment request must fit every record the transaction creates.
- **Execution Trace:**
  1. `backend/equipment/validation.ts:6-9` — The validator permits up to 50 condition records with bounded multiline notes.
  2. `backend/equipment/repository.ts:43-51` — A damaged return adds reports, then aggregates all conditions, generated report IDs and distance into one activity event.
  3. `backend/database/migrations/006_equipment_workflows.sql:61-74` — The 65,536-byte JSONB text check rejects the expanded event and the transaction rolls back every return write.
- **Adversarial Reproduction:** Use a synthetic 50-item damaged return with each note containing 790 letters, 209 internal line breaks and a trailing letter. The focused check measured 64,986 bytes for a valid request and 67,208 bytes for its PostgreSQL activity details.
- **Blast Radius:** The borrower remains checked out after attempting an otherwise valid large return. The actual blocker is reported as a generic service failure.
- **Surgical Fix:** Keep notes in item checkouts and report rows. Store their IDs plus a compact summary in the aggregate event. Add a real-PostgreSQL boundary test through the HTTP request and activity read.

#### [LOGIC-015] A failed email acknowledgment strands jobs with no send attempt
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Broken Logic
- **Location:** `backend/database/leased-outbox.ts:31-47`, `backend/email/delivery.ts:5-9,20-29`, `backend/alerts/outbox.ts:6-18`, `backend/bug-reports/outbox.ts:5-18`
- **Violated / Missing Invariant:** Only a job whose provider call may have occurred becomes uncertain. Unstarted work stays eligible for delivery.
- **Execution Trace:**
  1. `backend/database/leased-outbox.ts:41-46` — Claim immediately marks up to five jobs sending and increments every attempt count.
  2. `backend/email/delivery.ts:23-27` — One rejected acknowledgment aborts the serial loop before it reaches later jobs.
  3. `backend/database/leased-outbox.ts:37-43` — The next sweep marks expired sending leases uncertain, including untouched jobs that never reached a provider.
- **Adversarial Reproduction:** A local mocked batch confirmed that rejecting acknowledgment for the first of two jobs sends only the first. Extend the fixture with expiry and assert the second remains claimable.
- **Blast Radius:** Invitations, decision emails, equipment alerts, and support feedback. Some outboxes lack an operator retry path for uncertain jobs.
- **Surgical Fix:** Distinguish claim from durable send initiation, reclaim leases that never reached initiation, and isolate acknowledgement failures per job. Classify pre-send dependency failures separately from ambiguous provider outcomes.

#### [LOGIC-016] Slow initial reads can discard unsaved Production and reservation edits
- **Severity:** P1 | **Confidence:** [VERIFIED]
- **Domain:** Concurrency, Race Conditions & Async Timing
- **Type:** Broken Logic
- **Location:** `src/views/Production/Production.tsx:75-84,142-172,212-213,257-267`, `src/views/Equipment/Reservations.tsx:43-56,91,115-129,164-167`
- **Violated / Missing Invariant:** Background hydration cannot change a user's current edit target or discard draft input.
- **Execution Trace:**
  1. `src/views/Production/Production.tsx:142-147` — Cached rows are usable while an automatic deep-link detail read is pending.
  2. `src/views/Production/Production.tsx:166-172,212-213` — The user opens another brief and edits it. The automatic response uses accept directly and resets selection, form, and dirty state.
  3. `src/views/Equipment/Reservations.tsx:91,115-129,164-167` — Reservation bootstrap can force the deep-linked detail view. An incoming revision also changes the editor key and remounts the form from server state.
- **Adversarial Reproduction:** With a warm cache, defer the Production deep-link response, open a second brief and type a change, then resolve the first response. For reservations, begin editing cached version 1 and then resolve the refresh with version 2.
- **Blast Radius:** Unsaved text or reservation changes disappear without conflict feedback.
- **Surgical Fix:** Send bootstrap through the same selection and generation guards as explicit navigation. Keep editor draft and base revision stable and surface newly arrived revisions as conflicts.

#### [LOGIC-017] Federated sessions lack the lifecycle used after OAuth callback
- **Severity:** P1 | **Confidence:** [CONDITIONAL]
- **Domain:** Cross-Layer Synthesis & Gap Reconciliation
- **Type:** Missing Logic
- **Location:** `src/auth/cognito.ts:90-106,168-190`, `src/auth/password.ts:7-15`, `src/components/AppShell.tsx:87-94,154-162`, `docs/login.md:19`
- **Violated / Missing Invariant:** A supported sign-in method requires consistent session restoration and renewal while its credentials remain valid.
- **Execution Trace:**
  1. `src/auth/cognito.ts:101-106,173-179` — The OAuth exchange uses the access and ID tokens in verified module memory and discards the refresh response.
  2. `src/components/AppShell.tsx:87-94,154-162` — Reload and the renewal timer ask the password SDK to restore the session.
  3. `src/auth/password.ts:10-15` — That SDK has no session from the OAuth exchange. The shell signs the user out on reload or when its refresh timer fires.
- **Adversarial Reproduction:** In a mock provider configuration with federation enabled and no password session, assert that callback sign-in survives a reload and renews near expiry.
- **Blast Radius:** Federated users where a provider is enabled. The production publication defaults inspected in `scripts/publish-production-web.ts:14` and `scripts/deploy-production-application.ts:15` disable federation. Confirm the effective build configuration before assigning deployed impact.
- **Surgical Fix:** Use a single OAuth-capable session provider to own exchange, refresh, restore, and sign-out. Test both password and federated paths under the same session contract.

#### [LOGIC-018] Failed attachment finalization can leave unreferenced private storage
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Missing Logic
- **Location:** `backend/production/storage.ts:22-31`, `backend/production/repository.ts:282-292`, `backend/database/photo-storage.ts:49-64`, `backend/database/api-repository.ts:217-227,241-248`, `backend/database/migrations/016_retention_purge.sql:5-16`
- **Violated / Missing Invariant:** A private object published ahead of a DB commit must remain recoverable or be eligible for reference-aware cleanup.
- **Execution Trace:**
  1. `backend/production/storage.ts:22-31` and `backend/database/photo-storage.ts:60-64` — S3 receives a final object before the DB marks the upload ready.
  2. `backend/production/repository.ts:285-291` and `backend/database/api-repository.ts:224-226,241-248` — A process or transaction failure preserves pending DB state after the final object exists.
  3. `backend/database/migrations/016_retention_purge.sql:8-15` — Staging can expire, and pending photo rows can be purged, without reconciling already-written final bytes.
- **Adversarial Reproduction:** Stub successful final copy or put followed by failed DB commit. Expire staging and discard or purge metadata. Assert finalized bytes remain discoverable for retry or safe cleanup.
- **Blast Radius:** Unreferenced private bytes remain in storage. Pending brief files may need to be reuploaded or manually discarded.
- **Surgical Fix:** Record recoverable finalization attempts and object versions. Reconcile unreferenced final objects after a grace period and preserve all references from active records and historical snapshots.

#### [LOGIC-019] Attachment removal retries create duplicate history
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Broken Logic
- **Location:** `src/api/production.ts:28`, `backend/production/repository.ts:264-280`
- **Violated / Missing Invariant:** Removing an already discarded attachment should leave the version and history stable.
- **Execution Trace:**
  1. `src/api/production.ts:28` — The client sends attachment DELETE without a command receipt.
  2. `backend/production/repository.ts:264-279` — Every request updates status, increments the brief version and inserts a removal with a fresh random request ID.
  3. A replay adds another event and invalidates any editor holding the version produced by the first removal.
- **Adversarial Reproduction:** Remove a file, suppress the successful response, and retry the same removal while the brief remains editable.
- **Blast Radius:** Inaccurate brief histories and avoidable version conflicts.
- **Surgical Fix:** After authorization, return success immediately when the locked row is discarded. Increment version and write history only when a status-changing UPDATE returns the row.

#### [LOGIC-020] Editing a reservation loses DST disambiguation and timestamp precision
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Data Invariants, Type Boundaries & Contract Drift
- **Type:** Broken Logic
- **Location:** `backend/database/api-validation.ts:66-83`, `src/views/Equipment/Reservations.tsx:21-22,165-187`, `backend/equipment/repository.ts:29-32`
- **Violated / Missing Invariant:** A field unchanged by the editor must preserve its stored instant.
- **Execution Trace:**
  1. `backend/database/api-validation.ts:66-83` — Valid booking instants can include explicit offsets, seconds, and milliseconds.
  2. `src/views/Equipment/Reservations.tsx:22,165-176` — The form truncates to device-local minutes, then reparses both values on save.
  3. `backend/equipment/repository.ts:29-32` — A future booking can silently shift. For a checked-out booking, immutable start comparison can reject an otherwise valid extension.
- **Adversarial Reproduction:** With the device in New York, hydrate the second occurrence of 1:30 a.m. on November 1, 2026. A local run confirmed that 06:30Z serializes back as 05:30Z. Also test unchanged nonzero seconds and the nonexistent spring 2:30 a.m.
- **Blast Radius:** Silent scheduling changes or blocked extensions for affected bookings. Existing conflict checks can turn a silent shift into a rejected save.
- **Surgical Fix:** Preserve each original instant until the user edits that field. Make the checkout start absent from an end-only extension, reject nonexistent wall times, and explicitly disambiguate repeated local times.

#### [LOGIC-021] Projected shoot dates bypass the confirmed-window duration cap
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Data Invariants, Type Boundaries & Contract Drift
- **Type:** Broken Logic
- **Location:** `backend/production/validation.ts:33-36,46-57`, `src/production/readiness.ts:3-7`, `backend/production/repository.ts:201-207,296-305`, `backend/database/migrations/029_production_planning.sql:1-3`
- **Violated / Missing Invariant:** The same confirmed shoot duration rule applies regardless of which form or saved projection supplies the dates.
- **Execution Trace:**
  1. `backend/production/validation.ts:33-36,46-57` — Explicit schedules and soft holds have a 31-day maximum. Projected start/end fields are only checked for order and delivery bounds.
  2. `src/production/readiness.ts:3-7` — A projection can become the sole soft hold.
  3. `backend/production/repository.ts:204,296-305` — Approval confirms that window without the 31-day check, and the migration permits it.
- **Adversarial Reproduction:** Save one projected shoot window spanning 45 days, with delivery after the end, then approve it without explicit dates. Compare with scheduling the same explicit interval.
- **Blast Radius:** Calendar and crew logic can receive confirmed windows the normal scheduling command rejects.
- **Surgical Fix:** Apply one duration validator to canonical start and end after resolving the source. Add a DB constraint after identifying and resolving existing overlong windows.

#### [LOGIC-022] Archiving a client blocks unrelated edits to a linked idea
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** State Machine, Lifecycle & Workflow Integrity
- **Type:** Broken Logic
- **Location:** `src/views/Production/IdeaBoard.tsx:21-24`, `backend/production/ideas.ts:12-28`, `backend/production/repository.ts:74-80`, `backend/equipment/repository.ts:34-36`
- **Violated / Missing Invariant:** Historical client associations remain valid when editing unrelated fields. New or changed associations require an active client.
- **Execution Trace:**
  1. `src/views/Production/IdeaBoard.tsx:21-24` — The editor retains the currently linked deleted client and sends it on save.
  2. `backend/production/ideas.ts:14-15` — A deleted client is rejected before reading or locking the idea.
  3. `backend/production/ideas.ts:16-28` — The rejected reference blocks title and status edits. It also blocks a replay of a committed creation if the client was deleted before the retry.
- **Adversarial Reproduction:** Link an idea to a client, delete the client, and save a title-only change while keeping the same client reference.
- **Blast Radius:** Linked ideas cannot be maintained without removing the historical link or restoring the client.
- **Surgical Fix:** Read the existing idea under lock. Require an active client only when the association is new or changed. Resolve a valid create receipt before checking today's client status.

#### [LOGIC-023] Feedback from an earlier email attempt can mark a later send failed
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Broken Logic
- **Location:** `backend/production/repository.ts:126-135`, `backend/production/notifications.ts:66-74`, `backend/email/feedback.ts:14-18,26-28`, `backend/database/leased-outbox.ts:9-16`
- **Violated / Missing Invariant:** A delivery attempt's status is changed only by that attempt's acknowledgment or provider feedback.
- **Execution Trace:**
  1. `backend/production/repository.ts:132-135` — Admin retries reset the existing job and keep its ID.
  2. `backend/production/notifications.ts:69-73` — The retry resolves the current address and sends with the same feedback tag.
  3. `backend/database/leased-outbox.ts:13-16` and `backend/email/feedback.ts:14-18` — An older bounce causes the new acknowledgment to become failed or overwrites an already recorded state for the same job.
- **Adversarial Reproduction:** In mocked SES, record a bounce for a first address, replace it with a verified address, and accept the retry. Deliver old feedback both before and after the second acknowledgment.
- **Blast Radius:** Successful deliveries can be labeled failed and manually resent. Exposure requires the feedback integration and a retry of the same job.
- **Surgical Fix:** Store an immutable delivery attempt ID and provider correlation ID for each send. Apply status changes only to the matching attempt. Keep address suppression independent of the job status.

#### [LOGIC-024] A revoked invitation can still trigger a queued send
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Missing Logic
- **Location:** `backend/accounts/queue.ts:19-27`, `backend/accounts/invitations.ts:27-32`, `backend/accounts/worker.ts:79-87`, `backend/accounts/directory.ts:34-35`
- **Violated / Missing Invariant:** A provider action starting after invitation revocation requires a current pending invitation and valid lease.
- **Execution Trace:**
  1. `backend/accounts/queue.ts:23-27` — A pending invitation is leased and returned to the worker.
  2. `backend/accounts/invitations.ts:27-32` — Revocation changes membership invitation status without cancelling the leased action.
  3. `backend/accounts/worker.ts:79-87` — The worker can send, provision, or resend credentials without checking the current invitation or issuing administrator. The acceptance handler separately rejects revoked invitations.
- **Adversarial Reproduction:** A provider-mocked regression should assert zero provider calls when a leased invitation is revoked before send initiation.
- **Blast Radius:** A revoked invitation may send an unwanted email or create a provider identity. It cannot grant workspace membership through that revoked record.
- **Surgical Fix:** Recheck active issuer authority, pending status, expiry, and lease just before the provider action. Cancel unstarted leases at revocation and track already initiated sends.

#### [LOGIC-025] A successful join-code retry cannot deliver the one-time code
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Cross-Layer Synthesis & Gap Reconciliation
- **Type:** Broken Logic
- **Location:** `backend/accounts/join-methods.ts:27-32,45-51,73-83`, `src/views/Accounts/Administration.tsx:60-67`, `src/views/Accounts/JoinMethods.tsx:42-45,59-67`
- **Violated / Missing Invariant:** Retrying a committed creation must produce a usable result or a recoverable terminal response.
- **Execution Trace:**
  1. `backend/accounts/join-methods.ts:73-83` — Extra join code creation stores only its hash and returns plaintext in the first response.
  2. `backend/accounts/join-methods.ts:27-32,47-51` — Replay returns the record without the plaintext code.
  3. `src/views/Accounts/JoinMethods.tsx:42-45` — The UI displays the code and closes the form only when plaintext is present, so an otherwise successful retry leaves the user without the code.
- **Adversarial Reproduction:** Commit extra join-code creation and lose its response, then resubmit unchanged from the same form.
- **Blast Radius:** An active code exists that its issuer cannot share. Recovery requires recognizing and revoking it and then creating a replacement.
- **Surgical Fix:** Return an explicit already-created result with the existing ID and a revoke-and-replace action. If the product requires replaying the secret, store a short-lived encrypted receipt scoped to the original issuer and command.

#### [LOGIC-026] A failed dashboard read is cached as zero reports or alerts
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Broken Logic
- **Location:** `src/views/Equipment/Dashboard.tsx:18-23,26-52,69-82,103-110`
- **Violated / Missing Invariant:** An empty successful result and an unavailable source must remain distinguishable across cache hydration.
- **Execution Trace:**
  1. `src/views/Equipment/Dashboard.tsx:29-41` — Inventory and bookings can succeed while reports or alerts fail.
  2. `src/views/Equipment/Dashboard.tsx:42-49` — The dashboard writes failed datasets to cache as empty arrays.
  3. `src/views/Equipment/Dashboard.tsx:18-23,69-82,103-110` — A subsequent mount displays a false zero or empty state while fresh data loads.
- **Adversarial Reproduction:** Load a dashboard with open reports. Make only the report request fail, navigate away, then remount and defer refresh. Confirm the status remains unavailable or shows the previous data as stale.
- **Blast Radius:** Dashboard users can mistake missing report or alert data for a healthy state.
- **Surgical Fix:** Cache keyed per-section successes with timestamps. Preserve usable stale results with explicit status and leave failed absent sections unknown.

#### [LOGIC-027] Organization search attempts outlive their purpose and block account recovery
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Missing Logic
- **Location:** `backend/accounts/onboarding.ts:35-43`, `backend/database/migrations/022_user_onboarding.sql:9-15`, `backend/database/migrations/016_retention_purge.sql:5-16`, `backend/database/migrations/017_unique_account_email.sql:54-60`
- **Violated / Missing Invariant:** A transient rate-limit record should expire and should not be treated as durable business history during identity recovery.
- **Execution Trace:**
  1. `backend/accounts/onboarding.ts:35-43` — Rate limiting counts searches within one hour and records each allowed search.
  2. `backend/database/migrations/022_user_onboarding.sql:9-15` and `backend/database/migrations/016_retention_purge.sql:5-16` — The records carry a user foreign key and the sweeper has no policy for this table.
  3. `backend/database/migrations/017_unique_account_email.sql:54-60` — Recovery moves join-code attempts and tries to remove the provisional profile. An organization search FK can block that removal.
- **Adversarial Reproduction:** Seed an otherwise empty provisional profile with one old search row. Assert the expiry job removes it and test that transient-only records cannot block legitimate recovery.
- **Blast Radius:** Growing search-attempt storage and failed identity recovery when a provisional profile has search history.
- **Surgical Fix:** Add a bounded purge indexed by attempt time and delete or migrate transient rows as part of authorized identity reconciliation.

#### [LOGIC-028] Every alert page rescans organization history and generates alerts
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Control Flow, Boolean Semantics & Failure Modes
- **Type:** Missing Logic
- **Location:** `backend/alerts/repository.ts:16-19`, `backend/alerts/records.ts:13-37`, `backend/alerts/outbox.ts:13-18`, `backend/database/leased-outbox.ts:34-40`, `src/views/Equipment/live.ts:15`, `src/views/Equipment/Dashboard.tsx:26-34`
- **Violated / Missing Invariant:** A paginated read should do bounded work relative to its page, and generation should advance independently of reads and send capacity.
- **Execution Trace:**
  1. `backend/alerts/repository.ts:16-19` — Every list page reconciles the whole organization before reading the user's page.
  2. `backend/alerts/records.ts:13-37` — Reconciliation performs organization-wide overdue/conflict writes, loads all eligible brief history, evaluates time windows in JavaScript, and inserts for each flagged brief.
  3. `backend/database/leased-outbox.ts:34-40` — The sweep also does the full preparation even after reaching the delivery batch cap. Client pagination repeats the work.
- **Adversarial Reproduction:** Seed many expired briefs and several pages of alerts for a recipient. Measure candidate rows and SQL statements across pages and a sweep with more than five pending deliveries.
- **Blast Radius:** Grows with organization history and home/alerts traffic. It can slow both paginated reads and queued mail.
- **Surgical Fix:** Generate alerts in bounded, indexed organization/time batches with an independent progress cursor. Keep GET read-only and report reconciliation failures separately.

#### [LOGIC-029] Client restore can also rename the account without rename authority
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Broken Logic
- **Location:** `backend/production/clients.ts:7-10,27-39`, `backend/production/repository.ts:20-24,88-90`
- **Violated / Missing Invariant:** A permitted state change does not confer permission to change separately protected fields.
- **Execution Trace:**
  1. `backend/production/clients.ts:7-10` — Creation and current leadership determine different permissions for delete/restore and rename.
  2. `backend/production/clients.ts:33-37` — The rename guard only runs when status remains the same.
  3. `backend/production/clients.ts:38-39` — The update writes the name even during a status-only action by a creator who no longer has leadership authority.
- **Adversarial Reproduction:** A defensive update regression should assert that a creator without leadership can perform an allowed status transition while the stored name remains protected.
- **Blast Radius:** Client names and their display in linked work can be altered by a former lead who originally created that client.
- **Surgical Fix:** Compute name and status changes independently under the client row lock and enforce the authorization for each changed field.

#### [LOGIC-030] Feedback email can label an off-site link as the reported application page
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Authorization, Isolation & Business Rule Bypass
- **Type:** Broken Logic
- **Location:** `backend/database/api.ts:94-95`, `backend/bug-reports/delivery.ts:3-7`, `backend/production/notifications.ts:79-83`
- **Violated / Missing Invariant:** The Page link in an application-generated feedback email must resolve to the configured StudioStack origin.
- **Execution Trace:**
  1. `backend/database/api.ts:94-95` — Validation checks allowed path characters but does not enforce same-origin URL semantics.
  2. `backend/bug-reports/delivery.ts:3-7` — The email renderer resolves the stored string as a URL using the configured web origin.
  3. `backend/production/notifications.ts:79-83` — The optional feedback sender can deliver a StudioStack email whose Page field points outside the application.
- **Adversarial Reproduction:** A defensive formatter test should assert that all accepted reference forms preserve the configured origin and that any stored nonconforming reference is omitted.
- **Blast Radius:** The configured support mailbox, where a recipient may trust the automatically generated Page link.
- **Surgical Fix:** Parse and canonicalize the pathname at ingress, enforce exact origin equality, and repeat the origin check when formatting persisted records.

#### [LOGIC-031] Preview can commit a decision while reporting that it failed
- **Severity:** P2 | **Confidence:** [VERIFIED]
- **Domain:** Cross-Layer Synthesis & Gap Reconciliation
- **Type:** Broken Logic
- **Location:** `src/production/preview.ts:44-50,60-62,86-88`, `src/preview/workspace.ts:23-25,34-36`, `src/preview/storage.ts:10-14`, `backend/production/repository.ts:176-184,239-243`
- **Violated / Missing Invariant:** A preview decision or assignment and its alert should commit together or expose a clear recoverable result.
- **Execution Trace:**
  1. `src/production/preview.ts:49,88` — Preview persists the new brief revision and event using the production storage key.
  2. `src/production/preview.ts:50,88` — It then writes alerts through a separate workspace storage key; quota or storage failure throws after the brief write.
  3. `src/production/preview.ts:60-62` — The caller sees a failed mutation and a retry with the same version fails as stale even though the change already committed.
- **Adversarial Reproduction:** A local preview fixture approved a submitted brief while the storage stub refused the workspace write. The request threw and rereading showed the brief approved at version 2.
- **Blast Radius:** Local preview can disagree with its own decision history or alerts and can teach testers the wrong failure semantics for the hosted workflow.
- **Surgical Fix:** Store preview state and alerts in one transactional record, or persist a replayable alert operation with the decision and reconcile it on the next read. Return the committed result on matching retries.

#### [LOGIC-032] Workspace picker drops memberships beyond the first API page
- **Severity:** P3 | **Confidence:** [VERIFIED]
- **Domain:** Data Invariants, Type Boundaries & Contract Drift
- **Type:** Missing Logic
- **Location:** `src/components/AppShell.tsx:27-32,196-199`, `backend/database/api-repository.ts:77-84`
- **Violated / Missing Invariant:** The picker must provide a way to reach all active memberships the server returns.
- **Execution Trace:**
  1. `backend/database/api-repository.ts:77-84` — The organization list returns ordered cursor pages.
  2. `src/components/AppShell.tsx:27-32,196-199` — Initial load and refresh use a single 100-item page and derive available workspaces from its items.
  3. A member beyond the first page cannot select that workspace. A previously selected workspace beyond that page falls back to the first.
- **Adversarial Reproduction:** Stub 101 active memberships across two API pages. Assert the last workspace is reachable and can be restored from the per-account selection.
- **Blast Radius:** Accounts with more than 100 active memberships.
- **Surgical Fix:** Fetch subsequent pages or make the picker cursor-aware. Resolve a persisted active selection independently of its position in the first page.

### 4. Missing Logic Register (Systemic Blind Spots)

| Missing Rule / Scenario | Affected Workflow | Consequence if Unhandled | Recommended Design |
| --- | --- | --- | --- |
| Write-safe cutover barriers and durable active-target selection (LOGIC-001) | Production API deployment and database rollback | Committed RDS writes vanish from the active environment on revert | Shared deployment state, live-target validation, private health check and explicit reconciliation after writes reopen |
| Shared last-owner invariant across all retirement paths (LOGIC-002) | Owner promotion, self-deletion, and maintenance | Organization loses owner-only administration | Common lock order and transactional owner preservation |
| Identity continuity and durable account retirement (LOGIC-004, 006, 007) | Email recovery and Cognito account deletion | Authority can follow an address, or partial deletion can leave old entitlements behind | Durable tombstone, provider reconciliation, verified transfers, and explicit role cleanup |
| Current eligibility at send initiation (LOGIC-003, 024) | Decision and invitation mail | Provider effects can happen after membership or invitation revocation | Delivery authorization under a current lease and explicit cancellation state |
| Independent physical proof, partial receipt, and missing disposition (LOGIC-008, 009) | Equipment handoff | Custody can be claimed without corroboration, or mixed returns cannot be recorded accurately | Staff or one-use receipt, per-item transitions, audited missing-item recovery |
| Expected revision on destructive actions (LOGIC-012) | Inventory updates, cancellation and brief deletion | New work is overwritten or removed by a stale command | Required version with locked compare and matching-operation receipt |
| Pending upload recovery and final-object reconciliation (LOGIC-013, 018) | Brief attachments and photos | An obsolete slot blocks submission or unreferenced private bytes remain | Author discard/expiry, durable finalization and reference-aware cleanup |
| Distinguishing unstarted sends from unknown provider outcomes (LOGIC-015, 023) | All leased mail and feedback handlers | Unsent messages become uncertain or past feedback changes a newer delivery | Attempt identity, explicit pre-send and send-start states, lease-aware replay |
| Search-attempt retention and bounded alert generation (LOGIC-027, 028) | Organization onboarding, home, and scheduled alerts | Increasing scan cost and blocked account rebinds | Indexed bounded cleanup and independent alert generation cursors |
| Federated refresh and resume (LOGIC-017) | Configured OAuth SSO | Federated session ends on refresh or the renewal timer | Common provider session lifecycle with callback and reload tests |

### 5. Dependency-Ordered Remediation Roadmap

Land separate focused changes. Each phase lists the dependency and the regression tests needed before merging changes that use it.

| Phase | Remediation sequence | Automated cases to add |
| --- | --- | --- |
| **A. Data preservation and schema foundations** | Require a verified target before the next production API redeploy and harden cutover recovery (001). Define an owner-preservation and account-retirement transaction and decide how privileged identity recovery works (002, 004, 006, 007). Add additive custody, upload operation, and mail-attempt storage needed by later phases. Backfill and check historical records before adding constraints. | **Script fault injection** for an API redeploy without local cutover metadata, accepted configuration changes with waiter timeout, failed pre-release target diagnostic, and a commit followed by failed metadata write. **PostgreSQL concurrency** for promotion and owner departures, concurrent membership creation and account retirement, and rollback after rejected owner changes. **Identity integration** for same-address distinct principals and provider deletion failure/retry. **Migration tests** for historical rows and compatible schema upgrades. |
| **B. Server transitions and authorization** | Use phase A's transaction primitives for access requests, repair/archive, handoff, and per-item return (005, 008–011, 014). Carry version requirements through compatible API versions (012). Keep historical client references and independently authorize client changes (021, 022, 029). Add same-origin feedback validation (030). | **Database barriers** for approve/deny vs. withdraw, adjacent pickup ordering, and edit vs. cancel/delete. **HTTP integration** for partial/missing returns, no custody change without verified handoff evidence, archived/damaged restore paths, 50-item multiline returns, expected version drift, legacy/current 31-day schedules, and deleted-client title/status edits. **Authorization tests** for each field and an origin-preserving feedback formatter. |
| **C. Fault-tolerant side effects** | Consume phase A's durable operation and attempt records. Check current decision/invitation authority, preserve provider correlation, recover safely from lost acknowledgments, and replace obsolete pending upload slots (003, 013, 015, 018, 019, 023, 024). Provide an explicit join-code recovery outcome (025). | **Provider-mocked integration** for revocation before claim and before send, shutdown at each lease step, pre-send dependency failure, duplicate acknowledgments, old feedback before and after a newer send, and replay of a committed join-code create. **Storage fault tests** for copy success plus DB failure, retry after staged bytes expire, duplicate discard, and snapshot-backed files surviving cleanup. |
| **D. Client revision and session behavior** | Apply the settled API preconditions and result shapes. Guard bootstrap and refresh, keep dirty drafts stable, preserve original timestamps, and hydrate cached data with status. Implement cursor-aware workspace selection and reliable federated restoration. Reconcile preview operations between storage keys (012, 016, 017, 020, 025, 026, 031, 032). | **Deferred-promise UI tests** for stale deep links, conflicting revisions, warm-cache navigation and unknown dashboard sections. **Time-zone unit tests** for New York DST gaps/folds, nonzero seconds and millisecond precision. **Auth lifecycle tests** for sign-in callback, reload, expiration, and sign-out. **Preview fault tests** for storage rejection after decision and stable repeated requests. **Pagination test** with 101 memberships and a persisted selection. |
| **E. Retention and bounded reconciliation** | Add indexed cleanup and explicit progress tracking after account and delivery transitions are recoverable (027, 028). Keep worker generation separate from read pagination and mail claims. | **PostgreSQL integration** for recent vs. expired search attempts, transient rows during authorized identity recovery, and bounded progress with a large history. **Read/worker integration** to verify repeated alert pages perform no generation writes and that delivery continues during reconciliation backlog. |

#### Adversarial scenario results

| Scenario | Outcome traced | Regression home |
| --- | --- | --- |
| Double-click / retry storm | Transaction receipts serialize ordinary duplicate booking creation. Attachment removal, a committed extra join-code response lost in transit, and a failed delivery acknowledgment still diverge (015, 019, 025). | PostgreSQL idempotency, replay receipts, and provider-mocked workers |
| Direct API use | Unknown fields and duplicate reservation items hit verified validation. Server-side authorization needs to protect handoff proof, client names, and feedback link origin independently of the UI (008, 029, 030). | Defensive server-side validation and authority assertions |
| Mid-flight crash | Local account data, final S3 objects, leased batches, and the cutover target can outlive the transaction or operation reporting failure (001, 006, 015, 018, 031). | Checkpoint fault injection |
| Competing actors and revocation | Inventory locks prevent concurrent overlapping bookings. Separate guards are missing for last-owner snapshots, withdrawal vs. approval, early pickup priority, and some irreversible provider effects (002, 003, 005, 011, 024). | Barrier-based concurrency and mocked delivery authorization |
| Boundary values | Timestamp normalization changes repeated DST time and precision. Valid multiline notes can exceed the derived activity cap. Derived projected dates escape the explicit 31-day limit (014, 020, 021). | Data-driven unit tests and real-PostgreSQL boundary tests |
| Stale tab | Version preconditions are missing on several mutations. Bootstrap can replace a newer selection or erase dirty values (012, 016). | Multi-session PostgreSQL and deferred UI tests |
| Out-of-order events | Old feedback can change newer delivery state. A provider ack can fail before other leased work starts. Pending attachment and custody states need explicit recovery transitions (009, 013, 015, 023). | Attempt-correlated event tests and lifecycle integration |

### 6. Remediation Status Ledger

The entries below describe the remediation branch. The original findings above describe the pre-remediation audit. Migrations 032–040 extend the existing schema in order. The two custody decisions were deferred by the product owner on November 21, 2026.

| Finding | Status | Files changed | Regression test | Result and follow-up |
| --- | --- | --- | --- | --- |
| LOGIC-001 | FIXED | `scripts/cutover-prod-to-rds.ts`, `scripts/prod-rds.ts`, `scripts/production-database.ts`, `scripts/deploy-production-api.ts`, `scripts/configure-production-capacity.ts`, `docs/rds-cutover.md` | `src/api/database.cutover-gate.test.ts`, `src/api/database.production-target.test.ts` | The runtime remains fenced through copy comparison, an independent IAM probe, runtime readback and rollout record writes. Pre-reopen recovery verifies Aurora. An ambiguous reopen keeps RDS authoritative. Deployments validate the live endpoint and capacity respects an observed write fence. |
| LOGIC-002 | FIXED | `backend/accounts/ownership.ts`, `backend/accounts/directory.ts`, `backend/accounts/repository.ts`, `backend/production/bootstrap.ts`, `backend/production/owner-handover.ts`, `backend/production/stale-account.ts` | `src/api/database.postgres.test.ts`, concurrent promotion and retirement | Separate real PostgreSQL sessions coordinate around the administration lock. Retirement rereads membership and returns 409 when the retiring account has become the last active owner. |
| LOGIC-003 | FIXED | `backend/production/outbox.ts`, `backend/production/repository.ts`, `backend/production/notifications.ts`, migration 033, `src/types/production.ts` | `src/api/database.postgres.test.ts`, revoked recipients before claim and after leasing. `src/production/notifications.test.ts`, send-time denial | The lease starts only for a current authorized recipient. Review text comes from the event after authorization, and skip counts and outcomes are kept without logging review content. |
| LOGIC-004 | HARDENED (CONDITIONAL) | Migrations 032 and 034, `backend/production/bootstrap.ts`, `backend/production/owner-handover.ts` | `src/api/database.postgres.test.ts`, same email across deleted and active sign-ins. `src/production/bootstrap.test.ts`, replacement subject on an existing workspace | An immutable issuer and subject retain authority. A replacement subject receives no roles through email recovery or repeat deployment. The existing email-recovery test previously expected a rebind and now asserts preservation of both identities and their memberships. |
| LOGIC-005 | FIXED | `backend/accounts/join-methods.ts` | `src/api/database.postgres.test.ts`, withdrawal wins over a concurrent approval | Compare-and-set the pending access request and revision before inserting membership or decision history. |
| LOGIC-006 | FIXED | `backend/accounts/deletion.ts`, `backend/accounts/directory.ts`, `backend/accounts/worker.ts`, `backend/database/api-entry.ts`, `backend/database/api-grants.ts`, `backend/database/api-repository.ts`, `infra/production/accounts.ts`, migration 034 | `src/api/database.postgres.test.ts`, deletion receipt, retry and profile rejection. `src/api/accounts.worker.test.ts`, failed provider deletion and immutable-subject recovery | Retirement and its recovery receipt commit together. The worker checks the original subject before removing the provider account. The existing API test now expects retired profile access to fail. Unsupported provider aliases require operator reconciliation. |
| LOGIC-007 | FIXED | `backend/accounts/ownership.ts`, `backend/accounts/directory.ts`, `backend/accounts/repository.ts`, `backend/production/stale-account.ts`, `src/preview/accounts.ts` | `src/api/database.postgres.test.ts`, retirement prunes reviewer and executive roles | Removing access clears Production designations in the membership transaction. The preview uses the same atomic local write for membership and designation removal. |
| LOGIC-008 | DEFERRED - NEEDS DECISION | None | Pending policy | Revisit physical handoff confirmation. The product owner asked to defer and indicated staff approval should not be required for ordinary returns. |
| LOGIC-009 | DEFERRED - NEEDS DECISION | None | Pending policy | Revisit combined received and missing-item returns, including when the booking restriction clears. |
| LOGIC-010 | FIXED | `backend/database/api-repository.ts`, `backend/equipment/reports.ts`, `backend/equipment/repository.ts`, `src/equipment/reservationPolicy.ts`, `src/preview/database.ts` | `src/api/database.postgres.test.ts`, damage resolution, explicit repair and retirement | Restoration preserves retirement. Booking and pickup require an available, serviceable item. |
| LOGIC-011 | FIXED | `backend/equipment/repository.ts`, `src/preview/database.ts` | `src/api/database.postgres.test.ts`, adjacent pickup is blocked during the current borrower's slot | Earlier overlapping custody takes priority even inside the next borrower's allowed early pickup window. The check runs under the equipment lock. |
| LOGIC-012 | FIXED | `backend/database/api.ts`, `backend/database/api-validation.ts`, `backend/database/api-repository.ts`, `backend/production/repository.ts`, `backend/production/routes.ts`, `src/api/database.ts`, `src/api/production.ts`, `src/types/database-api.ts`, `src/preview/database.ts`, `src/production/preview.ts`, `src/views/Equipment/Inventory.tsx`, `src/views/Equipment/Reservations.tsx`, `src/views/Production/Production.tsx`, `scripts/test-dev-api.ts` | `src/api/database.postgres.test.ts`, stale inventory update, cancellation and deletion plus terminal replays | Expected revisions are required at the API boundary. Existing route, client and UI test fixtures now send the revision their callers loaded. |
| LOGIC-013 | FIXED | `backend/production/repository.ts`, `src/production/preview.ts` | `src/api/database.postgres.test.ts`, author discards an administrator's pending upload | The brief author may remove an abandoned admin upload while editing. Completion retains the upload's authority check. |
| LOGIC-014 | FIXED | `backend/equipment/repository.ts` | `src/api/database.postgres.test.ts`, maximum-size multiline return | The original regression produced HTTP 400. Activity saves compact references and conditions, then reads durable notes from checkout records. |
| LOGIC-015 | FIXED | `backend/database/leased-outbox.ts`, `backend/email/delivery.ts`, `backend/accounts/queue.ts`, `backend/accounts/worker.ts`, `backend/alerts/delivery.ts`, `backend/alerts/outbox.ts`, `backend/bug-reports/outbox.ts`, `backend/production/outbox.ts`, `backend/production/notifications.ts`, `backend/database/api-grants.ts`, migration 035 | `src/production/notifications.test.ts`, failed acknowledgment in a batch. `src/api/database.postgres.test.ts`, expired unstarted lease. `src/api/alerts.delivery.test.ts`, transient directory preparation | Every queue records when an attempt reaches the send boundary. Expired unstarted leases become eligible again. The worker visits the rest of a claimed batch before reporting acknowledgment failures. Existing lease tests now distinguish unstarted and possibly sent outcomes. |
| LOGIC-016 | FIXED | `src/views/Production/Production.tsx`, `src/views/Equipment/Reservations.tsx` | `src/views/Production/Production.test.tsx`, delayed deep link versus a newer selected and edited draft | Late Production bootstrap respects a newer selection and local edits. The reservation editor keeps its opening revision while server lists refresh. |
| LOGIC-017 | HARDENED (CONDITIONAL) | `src/auth/cognito.ts`, `src/components/AppShell.tsx`, `docs/login.md` | `src/auth/cognito.test.ts`, callback, restore, rotation, renewal, sign-out and subject checks. `src/components/AppShell.test.tsx`, session lifecycle | The shell restores the original sign-in method. The OAuth refresh token is tab-scoped, while access and ID tokens stay in memory and are verified before use. The prior OAuth unit expectation now permits only the verified refresh record in tab storage. |
| LOGIC-018 | FIXED | `backend/database/private-object.ts`, `backend/database/photo-storage.ts`, `backend/database/api-repository.ts`, `backend/database/api-grants.ts`, `backend/production/storage.ts`, migration 040 | `src/api/private-finalization.test.ts`, final objects available after staging expiry. `src/api/database.postgres.test.ts`, durable intent after a deferred commit failure | Final writes are conditional and retry can recover existing private bytes. Photo retention keeps attempted finalizations, including pending legacy metadata. Compare production S3 Inventory against database and historical references to classify objects whose metadata was already purged before this migration. |
| LOGIC-019 | FIXED | `backend/production/repository.ts`, `src/production/preview.ts` | `src/api/database.postgres.test.ts`, repeated discard | An authorized replay retains the original brief revision and removal event. |
| LOGIC-020 | FIXED | `src/equipment/wallTime.ts`, `src/views/Equipment/Reservations.tsx` | `src/equipment/wallTime.test.ts`, New York spring gap and fall fold. `src/views/Equipment/Reservations.test.tsx`, name-only edit with nonzero seconds and milliseconds | The editor preserves unchanged instants and requires occurrence selection for newly entered repeated times. Availability and saves receive the same resolved instants. |
| LOGIC-021 | FIXED | `backend/production/repository.ts`, `backend/production/validation.ts`, `src/production/preview.ts` | `src/api/database.postgres.test.ts`, projected 31-day boundary | Explicit and derived confirmations use the same maximum window. Check existing confirmed dates for overlong windows before considering a database constraint. |
| LOGIC-022 | FIXED | `backend/production/ideas.ts` | `src/api/database.postgres.test.ts`, archived client retained through idea edit and create replay | Existing historical links survive unrelated changes. A new link still requires an active client. |
| LOGIC-023 | FIXED | `backend/database/leased-outbox.ts`, `backend/database/api-grants.ts`, `backend/email/feedback.ts`, `backend/accounts/worker.ts`, `backend/production/notifications.ts`, migration 036 | `src/api/database.postgres.test.ts`, stale feedback before and after acknowledgment and matching-attempt feedback | SES feedback targets the matching send attempt. Address-level suppression still applies independently. Legacy untagged feedback can affect a legacy untagged attempt. |
| LOGIC-024 | FIXED | `backend/accounts/invitations.ts`, `backend/accounts/queue.ts`, `backend/accounts/worker.ts`, `src/types/accounts.ts`, `src/views/Accounts/Administration.tsx`, migration 037 | `src/api/database.postgres.test.ts`, revocation prevents a leased job from beginning provider delivery | The final send gate checks the lease, invitation status/expiry and issuer authority. Unsending revoked jobs retain a skipped outcome. |
| LOGIC-025 | FIXED | `src/views/Accounts/JoinMethods.tsx` | `src/views/Accounts/Administration.test.tsx`, committed one-time code replay with lost response | The UI recognizes the receipt and offers to revoke and replace the code. The one-time plaintext is still disclosed only at creation. |
| LOGIC-026 | FIXED | `src/views/Equipment/Dashboard.tsx` | `src/views/Equipment/Dashboard.test.tsx`, failed sections followed by a warm-cache remount | Each successful section has its own cache lifetime. Unavailable reports and alerts keep the last successful snapshot or show an unknown value. |
| LOGIC-027 | FIXED | `backend/database/retention.ts`, `backend/database/api-grants.ts`, migration 038 | `src/api/database.postgres.test.ts`, expired and recent search attempts. `src/api/database.backend.test.ts`, fixed maintenance queries | Indexed retention removes up to 5,000 expired attempts per run after seven days, preserving the one-hour rate limit. Identity reconciliation preserves each profile under LOGIC-004. |
| LOGIC-028 | FIXED | `backend/alerts/records.ts`, `backend/alerts/reconciliation.ts`, `backend/alerts/repository.ts`, `backend/alerts/outbox.ts`, `backend/database/api.ts`, `backend/database/api-entry.ts`, `backend/database/api-grants.ts`, `backend/database/leased-outbox.ts`, `backend/production/notifications.ts`, migration 039 | `src/api/database.postgres.test.ts`, read-only alert list, scheduled generation and deduplication | A scheduled IAM task advances a durable keyset cursor independently of mail claims. Existing overdue and readiness tests trigger the sweep explicitly because listing now has no write side effects. |
| LOGIC-029 | FIXED | `backend/production/clients.ts`, `src/production/preview.ts` | `src/api/database.postgres.test.ts`, status-only permission rejects rename | Rename and archive/restore permissions are checked for each submitted change. |
| LOGIC-030 | FIXED | `backend/bug-reports/page-path.ts`, `backend/bug-reports/delivery.ts`, `backend/database/api.ts` | `src/api/bug-reports.delivery.test.ts`, stored off-origin page reference | The API and email formatter accept only a same-origin app path and recheck saved feedback before rendering a link. |
| LOGIC-031 | FIXED | `src/production/preview.ts`, `src/preview/workspace.ts`, `src/preview/database.ts`, `src/preview/accounts.ts` | `src/preview/database.test.ts`, quota failure and repeated decision | Production state, request receipts and workspace alerts commit in one storage write. Preview reads use the legacy production key until the first successful write in the combined format. |
| LOGIC-032 | FIXED | `src/components/AppShell.tsx`, `src/api/scoped.ts`, `src/views/Equipment/live.ts` | `src/components/AppShell.test.tsx`, 101 memberships and saved selection | Initial load and refresh read every cursor page. A late refresh cannot replace a newer session or memberships result. |

#### Production readiness checks

- Read the live Lambda and RDS configuration before rollout. Confirm `studiostack-prod-pg`, RDS PostgreSQL 17, `db.t4g.micro`, IAM user `studiostack_prod_app`, the instance-scoped `rds-db:connect` grant, and the expected VPC security groups and TLS. The recorded cutover already completed. Check configuration drift without rerunning cutover.
- Check snapshots and restore readiness. Apply migrations 032–040 and restricted grants before starting new workers. Coordinate worker and API deployment because the leased-delivery contract crosses deployable boundaries. During web-first publication the client uses the legacy write contract only after the old API rejects the revision during validation. The replacement API requires revisions. Verify current and draining workers can follow the active queue contract before reenabling schedules and log-triggered wakes.
- Verify Cognito issuer, app client, production owner subject, email-alias handling, and the self-deletion worker's pool-scoped call permissions. Verify immutable-subject lookup and deletion using a synthetic account in each supported sign-in mode. Review pending deletion receipts that require verified operator reconciliation.
- Check whether federation is enabled in the deployed web build and the Cognito client. If enabled, verify exact provider names, callback/logout URLs, granted scopes, refresh and revocation settings, subject continuity, and sign-out with the live provider. Verify password sign-in after any client rotation change. See [Cognito token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html) and [Cognito revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/revocation-endpoint.html).
- Verify the SES configuration set, bounce/complaint events and attempt tags, queue age, failed acknowledgments, pending account deletions, and scheduled alert cursor progress. Confirm the production notification task receives its five-minute EventBridge schedule. Cognito-generated invitation mail follows its configured provider feedback path.
- Confirm the production S3 staging lifecycle and bucket policy permit conditional writes to private final keys. Compare legacy inventory to database and historical attachment references before making a separate deletion decision. Confirm no lifecycle policy expires private final objects or referenced versions. See [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

#### Local verification

| Gate | Standard tests passed | Disposable PostgreSQL tests passed |
| --- | ---: | ---: |
| Audit baseline | 718 | 114 |
| Wave 1 | 725 | 116 |
| Wave 2 | 727 | 125 |
| Wave 3 | 735 | 134 |
| Wave 4 | 741 | 134 |
| Final | 743 | 134 |

`npm run typecheck`, `npm run typecheck:aws`, `npm test`, `npm run test:database:postgres`, and `git diff --check` passed. `npm run lint` passed with 29 warnings on baseline code. `npm run build` completed the static export on retry. The first build stopped with a security notice for the installed Next.js 16.4.3 version. The project still pins that version in its lockfile. Track the framework update separately and check the applicable static-export exposure before publication. [Next.js security release](https://github.com/vercel/next.js/releases/tag/v16.4.5)

#### Integration against the current main branch

The pull request stack retains the updates to equipment code normalization, booking navigation, and brief validation and confirmations that shipped after the initial audit. The full suite on the integrated tree passed 757 standard tests and 137 disposable PostgreSQL tests. The browser also has a regression check for the web-first deployment window. It retries inventory edits and reservation cancellation against the previous API only after the old parser rejects the added revision field before running a mutation. The replacement API requires the revision.
