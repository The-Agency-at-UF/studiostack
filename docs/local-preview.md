# Local preview

This checkout is based on GitHub `main` at `e18eda6` (PR #272), with the requested production-planning features and local preview adapters layered on top. The previous serving checkout was 137 commits behind this version.

Start with `npm run dev -- --webpack`, open http://localhost:5174, and choose **Open local preview** on the sign-in page. An existing preview session can simply reload.

Preview uses the current application screens and a typed local database adapter. It never creates an authenticated API client or writes to the hosted database. Data is kept in browser local storage; uploaded PDFs and images are kept in IndexedDB, so they survive refreshes. Existing production-preview briefs and client accounts are retained.

## Working workflows

| Area | What can be tried locally |
| --- | --- |
| Production | Draft/edit/submit/reopen, review queue, approval/denial/reasons, revision snapshots, date proposals and confirmations, green/red calendars and role defaults, milestones, crew requests/assignment conflicts, readiness flags, client accounts and the idea board. |
| Files | Categorized brief files, drop-zone or file-picker upload, completion, removal, revision downloads, equipment photos, and client logos. File bytes are saved locally and can be downloaded after refresh. |
| Equipment | Inventory/category/color/Archive controls, QR labels and matching, reservations and conflicts, edits/extensions/cancellation, pickup/return conditions, damaged returns, reports, comments, repairs, statistics, overdue badges and member booking locks with admin bypass. |
| Organization | The current People table and Manage side panel, workspace logos/location, member roles/access, settings, invitations, retry/revoke, reusable and limited join codes, domains, access requests and activity. |
| Onboarding | Switch to **Example new teammate · Join workspace**. The current /welcome/ flow opens automatically, with name confirmation and organization search. Use a preview invitation, join code, domain, or approve the pending access request as the owner. |
| Account | Current Profile, Workspaces, invitation/code joining, Notifications and sign-in/security screens. Workspace logos, location and settings persist locally. |
| Alerts | Overdue returns, readiness and crew/report activity, read state and notification preferences. |
| Delivery | The **Email simulation** menu chooses successful, failed or uncertain results. Decisions and invitations record simulated outcomes; failed/uncertain delivery can be retried. Nothing is actually emailed. |
| Feedback | Bug reports and feature requests, including local submission history. |

The **Preview account** control applies across the whole workspace. Taylor starts as owner; Alex represents Client Services, Jordan is a Production Lead and Sam is an executive. Roles and access changes persist locally. Switching accounts clears cached workspace data so one role's screen does not retain another role's privileged view.

The location checkbox on pickup/return simulates on-campus versus off-campus checks. It does not request the device's real GPS location. Hardware/manual QR matching uses the same interface as production; a physical camera still uses browser camera permissions.

## Examples

Initial demo equipment includes an interview camera, key light, tripod, red and blue SD cards, a backdrop and a damaged microphone. Example bookings cover pickup, overdue checkout and returned history. An example microphone damage report and an example pending teammate request exercise the remaining queues.

Production includes **Campus stories** and **Example: shoot readiness check**. Browser verification also created **Example: local file uploads**, **Example preview client** with a StudioStack logo, and the downloadable **studiostack-preview-example.pdf**. Earlier user-created preview records are preserved.

## Boundaries

Actual sign-in, password recovery, email verification, S3 uploads and delivered emails still require the connected production services. Preview simulates those service outcomes and saves files in the browser. SharePoint/Canva links open the supplied external resources and may require their own sign-in.

## Validation

Local adapter tests cover persistence, reservation conflicts, condition history, simulated campus checks, damaged returns and reopened reports, overdue locks/recovery, role/access restrictions, all three guest join methods, invitation retries and restoration of removed members through invitations, attachment/logo storage, readiness/decision alerts, history visibility, suspended crew, deleted-identity recovery, current crew assignment controls, and pitch-to-draft client carryover. Browser checks verified a real PDF upload/download after refresh with identical bytes, a real client-logo upload, current organization controls, and member-only reservation controls.

Latest GitHub integration validation: 686 application tests and 114 disposable PostgreSQL tests passed (800 total), TypeScript passed, lint completed with no errors (nine warnings), and the optimized webpack build/static export passed. Browser checks covered Account joining and notification preferences, separate production calendar filters, guided name/organization search, workspace-logo upload and persistence after reload, and Equipment at 1440/768/390 pixels. The temporary workspace-logo test was removed afterward; the example location is Gainesville, FL.

Inline brief client creation: use **+ Add client** beside **Client account** in an editable brief (owners/admins/Production Leads). Creating a client selects it and fills Client while retaining unsaved brief edits. Browser verification added the local client **Example inline client** and draft **Example: inline client creation**.

Brief file layout: templates and the Canva guide are always visible above Request details. The creative PDF is beside Project summary; storyboard, visual references, brand guidelines and creative assets follow their matching Creative direction fields. Paperwork pairs permit/release questions with location/release uploads and includes shot list and consent uploads. All nine categories remain available regardless of production type. Existing files remain in place; read-only downloads work without submitting the brief. Validation: 688 application tests, TypeScript and focused lint passed; 1440/768/390 browser review passed. The existing example PDF was uploaded under Other references on Example: local file uploads, persisted after reload, and downloaded with identical bytes.

Guided brief integration: the Production brief step UI from upstream PR #274 (2caaaaf, included in GitHub main 9fee3c9) is preserved, with contextual uploads inside its steps instead of a separate Attachments step. Crew requests have their own step and soft holds appear in Timeline. Templates remain visible above the workflow; full-width draft editing, required-field errors, review/submit, inline client creation, read-only downloads and local file persistence remain available. The updated preview for this checkout runs on http://localhost:5175 because port 5174 is serving a separate checkout; that process and its working files were left intact. Browser verification used Example: guided uploads and the existing example PDF. All 689 application tests passed, final focused tests passed, TypeScript and focused lint passed, and desktop/tablet/phone review found no blocking issues.
