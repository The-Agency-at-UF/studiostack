# Organization and account UI preview

The organization routes `/organization/` and `/organization/settings/` provide
an explicitly labeled, fictional in-memory preview for members, settings and
activity. Changes reset on refresh; invitations send no email and do not create
real accounts, roles or memberships.

The header adds an account disclosure with working reservation, member-management
and organization-settings links. It removes the Production desk and Admin access
labels. Escape, outside-pointer dismissal and keyboard focus are tested. Sign-out
retains the existing callback; real authentication is supplied by the later login PR.

The preview supports member search/status filters, organization switching,
invitation forms, role/status changes and settings. It prevents removing the last
active administrator within its fictional data. These controls are not a backend
authorization mechanism.

Organization-local groups are represented by the database foundation/API PRs.
This UI does not yet include group-membership management, live invitations,
server-persisted settings or real tenant onboarding.

```sh
npm test -- src/components/Header.test.tsx src/views/Organization/Organization.test.tsx
npm run typecheck
npm run build
```
