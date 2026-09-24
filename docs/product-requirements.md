# Product Requirements

This document consolidates the product behaviors described by the previous StudioStack senior-project teams. It is a requirements reference, not a claim that every workflow is fully connected to production services today.

## Product purpose

StudioStack is the production desk for The Agency at UF. It centralizes equipment availability, reservations, checkout and return activity, issue reporting, approved-user access, and operational oversight.

## Users

- **Students and production team members** reserve equipment, review their reservations, return gear, and report equipment problems.
- **Administrators** manage inventory, users, teams, reports, overdue activity, and operational statistics.

## Pages and access

| Page | Access | Required behavior |
| --- | --- | --- |
| Home / Dashboard | Students and admins | Show upcoming reservations, reserved equipment, notifications, overdue alerts, and useful shortcuts. Admins also receive management shortcuts and report alerts. |
| Calendar | Students and admins | Display past and upcoming reservations in month, week, and day views. Selecting a reservation reveals its details. |
| Reservations | Students and admins | Show active and past reservations and support creating, editing, extending, cancelling, checking out, and returning reservations. |
| Reports | Students and admins | Let users submit equipment problems and review their active and resolved reports. Let admins review and resolve all reports. |
| Statistics | Admin only | Summarize overdue equipment, users with overdue history, reservations, inventory, and reporting activity. |
| Teams / Clients | Students and admins | List internal and client teams. Administrators can add and remove teams. |
| Users | Admin only | Manage the approved-user list, membership, and roles. |
| Inventory | Access under review | List equipment, categories, statuses, identifiers, and QR codes. Administrators can manage equipment; student browsing access still needs a final decision. |

## Core workflows

### Reserve equipment

1. Review equipment availability for the intended checkout and return window.
2. Select equipment and associate the reservation with an internal or client team.
3. Validate that the requested equipment is available and that the time range is valid.
4. Create the reservation and make it visible in the reservation list and calendar.
5. Allow permitted edits, extensions, or cancellation before completion.

### Checkout and return

1. Open the active reservation.
2. Confirm the equipment being checked out, using its identifier or QR code where available.
3. Record checkout status and time.
4. Confirm each returned item and record its condition.
5. Flag overdue, missing, or damaged equipment for follow-up.

### Report an equipment problem

1. Select the issue type and affected equipment.
2. Record the reporter and a useful description.
3. Make the report visible to administrators.
4. Let an administrator investigate and resolve the report.
5. Preserve active and resolved report history.

## Notification requirements

The senior-project documentation identifies these notification behaviors:

- Display relevant notifications on the dashboard.
- Alert administrators when an equipment report is submitted.
- Notify the reporting user when an issue is resolved.
- Send an overdue-equipment notice when a return deadline is missed.
- Notify affected users when broken equipment conflicts with a future reservation.
- Support reservation reminders approximately 12 to 24 hours before checkout as a later enhancement.

## Product rules

- A user must only see actions permitted by their role.
- Equipment availability must account for overlapping reservation windows.
- Reservation, checkout, return, and report history must remain understandable after an item or user changes status.
- Empty states must explain that no records exist instead of showing an unexplained blank area.
- Destructive administrative actions must require clear intent and provide useful feedback.
- The responsive interface must preserve the same workflows on smaller screens.

## Open decisions

- Whether students can browse all inventory or only equipment available through the reservation flow.
- The final institutional authentication and approved-user onboarding process.
- Which notifications are in-app only and which also require email.
- Retention rules for historical reservations, reports, and user activity.
