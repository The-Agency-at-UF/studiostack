# Production planning and equipment workflow

## Product choices

- Content ideas live on the **Idea board** tab. Members can create and maintain their own unselected pitches; Production Leads and administrators select pitches. A selected pitch can seed a new brief.
- Regular members see active reservations and current decision reasons. Closed reservation history, reservation activity, brief revision snapshots and historical attachment downloads are restricted. Records remain stored. Leadership retains history access.
- Overdue checked-out equipment prevents its borrower from creating another reservation. Owners and administrators bypass the personal lock. No one can reserve the overdue item until it is returned. Existing reservation retries remain idempotent.
- Soft holds are calendar proposals and do not reserve equipment or crew. Both members and administrators can view them. The Production calendar defaults the toggle off for members and on for Production Leads, owners and administrators. The Gear calendar defaults it on for owners and administrators.
- A brief can be approved while shoot dates remain pending. A sole proposal is confirmed on approval for compatibility; multiple proposals require an explicit selection or confirmed window. Leadership can also confirm dates before approving the brief.
- Readiness flags appear within **72 hours** of the start (and during the shoot), until the approved date, approved brief and confirmed crew are complete. Alerts are deduplicated per brief, day and set of missing prerequisites, and go to the submitter and administrators.
- Crew requests specify position, start/end time and location. Saving leadership assignments confirms filled positions. All requested positions must be filled for crew readiness. Changing confirmed shoot dates shifts non-editor requests by the start-time difference, clears all crew confirmations and notifies previously assigned teammates. Video editing requests retain their own dates. Assignment conflict checks use requested shift times, falling back to the confirmed shoot window for older briefs.
- Archive is the equipment UI label. The stored `retired` value remains compatible with older clients.

## Files and logos

Private brief uploads are categorized as brand guidelines, creative assets, PDF creative brief, shot list, release, location agreement, consent, storyboard or reference. A brief supports 20 files, each up to 20 MiB. Creative assets accept PNG/JPEG; creative briefs require PDF. Other categories accept PDF/JPEG/PNG/WebP. The existing S3 verification and immutable-copy flow protects completed files and preserves submission attachment snapshots.

Client logos reuse the existing private, sanitized organization-photo upload flow and signed downloads. Owners and administrators upload logos. Client deletion and restore follow the current owner, administrator or creator permission rule. Logo references must point to a completed photo in the same organization.

Resources and Get Started contain the supplied SharePoint and Canva links. Since authenticated SharePoint access was unavailable during implementation, the documents are labeled “Official production template 1” and “2.” The URLs can be overridden with `NEXT_PUBLIC_RELEASE_TEMPLATE_URL`, `NEXT_PUBLIC_LOCATION_TEMPLATE_URL` and `NEXT_PUBLIC_CANVA_BRIEF_GUIDE_URL`.

## Local development

```sh
npm run dev -- --webpack
```

Open http://localhost:5174. In development, **Open local preview** uses browser-only example data, persistent local uploads/logos, the current organization screens and simulated email/invitation delivery. See [Local preview](local-preview.md) for role switching, guest onboarding and the supported workflows. Authenticated records and real delivery use the connected services. No AWS resources are changed by running the local app or the disposable PostgreSQL tests.

Dependencies are installed in this checkout. Both the usual development command and the webpack preview command are available.

Browser review added two explicitly labeled local examples: the pitch **Example: A day in the studio** and the draft brief **Example: production workflow**. They remain only in the browser preview. Desktop/tablet/phone review corrected the idea list and action layout; independent review also corrected stale crew confirmations when shoots move or return for changes.

## Backend rollout

Before using the changes against a hosted API, apply migrations **028–031** (after the current main-branch migrations through 027), reapply `databaseApiGrants`, and publish the API handler and additive route stack. Use the focused rollout script below after the reviewed backend stack is merged, before the matching website is published. New routes are appended after existing route IDs, preserving deployed resource identities. The web build alone does not update the database/API.

Suggested focused review order, with each change based on the preceding one:

1. Equipment catalog schema/API/UI: categories, Archive label, color tags and breakage summary.
2. Overdue reservation policy, occupied gear behavior and badge/alert.
3. Production planning schema and API: soft holds and requested crew positions.
4. Idea board schema/API/UI.
5. Admin brief queue, calendar filters and readiness UI/alerts.
6. Categorized brief upload API/UI.
7. Client logo schema/API/UI and onboarding/resources pages.

Keep migrations/grants with their supporting backend changes, then stack dependent interface work. Each eventual PR should name its base and merge order and include its own validation. Schema, policy, API, routes, alerts, preview adapters and interface work are reviewed in a dependency-ordered PR stack. Automated reviewers are not requested.

## Verification

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:database:postgres` (fresh disposable PostgreSQL container, restricted runtime role)
- `npm run build -- --webpack`
- Browser checks at 1440, 768 and 390 pixels using local preview.

S3 and email transport are covered by existing adapters/tests; the new end-to-end PostgreSQL tests use deterministic storage adapters and verify persistence, access control, optimistic versions, denial outbox payloads and alert recipients. Real S3 uploads, email delivery and private SharePoint documents require the user's authenticated services and were not exercised during the local review.

## Production rollout

From a clean checkout of the reviewed release commit, run `npm run db:api:prepare`, then pass its printed `DATABASE_API_BUILD` to `node --import=tsx scripts/deploy-production-planning.ts --apply-prod`. The script backs up the current runtime, applies the checksummed additive migrations and restricted grants with temporary maintenance access, updates the runtime, appends JWT routes without replacing existing IDs, and verifies unauthenticated requests are rejected. The maintenance function and master-secret access are removed in the existing cleanup path. It does not bootstrap identities or send invitation email.

The existing development and production website workflows publish merged main after the complete suite passes and verify every static route and asset. Revert application code by restoring the recorded runtime and web commit; retain the additive schema and records.
