# The Agency workspace

The real organization uses slug `agency-uf` and name **The Agency at UF**, separately in development and production. Setup reuses an existing organization and preserves existing member roles and suspension state. It never creates sample equipment or client accounts in the real workspace.

## Access tiers

These are application permissions stored in PostgreSQL and checked by the authenticated API. A profile title or email domain does not grant access.

| Tier | Production | Equipment | Administration |
| --- | --- | --- | --- |
| Owner / administrator | Review, approve, deny, schedule, assign crews, manage client accounts | Inventory management and all booking details | Invite members and manage roles, teams and Production Leads |
| Production Lead | Review, approve, deny, schedule, assign crews, manage client accounts | Organization booking names, dates and equipment; other members’ bookings are read-only | No organization administration |
| Member | Create briefs, see shared submitted production and calendars; edit own drafts | Browse inventory and shared availability; manage own reservations | No access management |

Organization members cannot read another author's draft. Other organization data remains isolated. Production Leads are selected in **Production → Access & notifications**. Owner/administrator roles include these capabilities. Allison has not been assigned or invited; select her active account when she joins.

## Shoot assignments

1. Submit a brief with proposed dates.
2. Production leadership approves it, confirming the dates.
3. Open the shoot from the Production calendar and use **Shoot crew & readiness** to select active teammates and their roles.
4. Save assignments. Each changed assignment produces one in-app alert with a link to that shoot. Retrying the same request does not duplicate alerts. Removal and schedule changes also notify affected active crew.

Concurrent assignment and scheduling changes prevent assigning the same person to overlapping approved shoots. Assignment requires an approved, dated shoot. The calendar distinguishes scheduled shoots awaiting crew from those with crew assigned; this does not certify equipment, releases or other shoot prerequisites.

Assignment notifications are in-app. Optional equipment email and ELT decision email keep their existing settings.

## Client accounts and equipment

Production Leads and administrators add or archive client accounts in **Production → Client accounts**. Existing brief client names are migrated to shared accounts. New briefs and equipment reservations can select an account. Filter production/calendar and bookings by client. Archived clients retain their linked history.

**Inventory** has views for all production equipment, available gear, checked-out gear and maintenance. Records are real organization inventory; add actual equipment through the existing admin form.

**Pickup & return** accepts a camera QR scan, a USB/Bluetooth keyboard-style label scanner, or manual code entry. Scanner Enter matches a reserved item without submitting the handoff. Unknown codes are rejected. Record each item's condition before completing checkout/return. Labels identify items; they are not authentication credentials.

## Validation and rollout

Migration `009_agency_production_assignments.sql` adds tenant-scoped clients/crew and assignment alerts. Do not edit an applied migration. Use `scripts/deploy-agency-workspace.ts --apply-dev` or `--apply-prod` with prepared API packages. The script applies migrations/grants, reuses the approved owner's Cognito identity and organization, updates the restricted runtime/routes, and saves local verification metadata. Temporary database maintenance roles/functions are removed in cleanup.

Production Lead permissions are derived from the selected organization’s saved reviewer IDs on every server request after verifying active membership. Leads can request changes as well as approve, confirm dates and deny submitted briefs. Removing the designation revokes lead-only booking visibility and decision permissions. Viewing another member’s booking does not grant edit, cancellation, checkout or return access.
