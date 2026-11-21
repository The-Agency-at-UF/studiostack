import type { TourStep } from './Spotlight'

export type TourId = 'workspace'
/** Tour progress lives in this browser, per account, like the remembered organization choice. */
export const tourStorageKey = (owner: string) => 'studiostack.tour.' + owner
type TourContextValues = { isAdmin: boolean }

/** Steps whose anchors are hidden (the sidebar on mobile, the menu button on desktop) are skipped by the spotlight. */
export const tours: Record<TourId, (context: TourContextValues) => TourStep[]> = {
  workspace: ({ isAdmin }) => [
    { id: 'welcome', title: 'Welcome to StudioStack', body: 'StudioStack keeps your studio’s gear, bookings and productions in one place. This quick tour shows you around.' },
    { id: 'menu', target: 'menu-toggle', title: 'Open the menu', body: 'Tap here for every page and your account.' },
    { id: 'overview', target: 'nav-overview', title: 'Start at Home', body: 'Home shows what needs attention today: pickups, returns and production requests. Alerts collects overdue gear and other warnings.' },
    { id: 'production', target: 'nav-production', title: 'Plan productions', body: 'Production is where shoots are briefed, staffed and approved. Requests move through queues until they’re ready to shoot. The Shoot calendar shows confirmed shoots, tentative dates and milestones.' },
    { id: 'equipment', target: 'nav-equipment', title: 'Find and track gear', body: 'Browse Inventory, check availability on the Gear calendar, manage Reservations and file Damage reports when something is broken or missing.' },
    ...(isAdmin ? [{ id: 'administration', target: 'nav-administration', title: 'Run your workspace', body: 'As an administrator you can manage Members and their roles, review Statistics and change workspace Settings.' }] : []),
    { id: 'help', target: 'help', title: 'Get help', body: 'Open Help for the getting-started guide and resources, to replay this tour, or to report a bug or request a feature.' },
    { id: 'account', target: 'account', title: 'Your account', body: 'Edit your profile, switch workspaces or sign out.' },
    { id: 'done', title: 'You’re all set', body: 'Replay this tour anytime from the Help menu.' },
  ],
}
