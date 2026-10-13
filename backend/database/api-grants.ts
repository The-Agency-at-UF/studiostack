import type { DatabaseEnvironment } from './config'

/** Maintenance-only SQL; neither HTTP requests nor runtime ever grant privileges. */
export function databaseApiGrants(environment: DatabaseEnvironment) {
  if (!['dev', 'prod'].includes(environment)) throw new Error('Explicit database environment required')
  const role = `"studiostack_${environment}_app"`
  return `
    GRANT USAGE ON SCHEMA app TO ${role};
    GRANT SELECT, INSERT ON app.users TO ${role};
    GRANT UPDATE (email, display_name) ON app.users TO ${role};
    GRANT SELECT ON app.organizations, app.organization_memberships, app.user_group_memberships TO ${role};
    GRANT SELECT, INSERT ON app.user_groups, app.inventory, app.reservations, app.reservation_items TO ${role};
    GRANT UPDATE (name, category, status) ON app.inventory TO ${role};
    GRANT UPDATE (status) ON app.reservations TO ${role};
  `
}
