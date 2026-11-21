import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTour } from './tour/TourContext'
import StudioStack from '../assets/StudioStack.png'
import { HiOutlineUserCircle, HiOutlineChevronDown, HiOutlineCalendarDays, HiOutlineCalendar, HiOutlineCog6Tooth, HiOutlineUsers, HiOutlineHome, HiOutlineBell, HiOutlineVideoCamera, HiOutlineArchiveBox, HiOutlineClipboardDocumentList, HiOutlineWrenchScrewdriver, HiOutlineChartBar, HiOutlineBars3, HiOutlineXMark, HiOutlineArrowRightOnRectangle, HiOutlineSparkles, HiOutlineBugAnt, HiOutlineLightBulb, HiOutlineQuestionMarkCircle, HiOutlineBookOpen, HiOutlineRocketLaunch } from 'react-icons/hi2'
import { closeWithExit } from './workspace/closeWithExit'
import '../styles/shell.css'

type Props = { isAdmin: boolean; logOut: () => void | Promise<void>; email?: string; onReportBug?: () => void; onRequestFeature?: () => void; organizationName?: string; organizationLogoUrl?: string | null; overdueReservations?: number }

type Menu = 'help' | 'account' | null

/** A sidebar-footer popover. Its panel plays an exit before unmounting; navigation from inside it closes at once. */
function MenuPopover({ id, tour, open, onOpen, onClose, trigger, triggerRef, children }: { id: string; tour: string; open: boolean; onOpen: () => void; onClose: () => void; trigger: (props: { ref: RefObject<HTMLButtonElement>; 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }) => ReactNode; triggerRef: RefObject<HTMLButtonElement>; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null)
  const close = () => closeWithExit(panel.current, onClose)
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLElement>('.account-panel :is(a,button)')?.focus()
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return <div className="account-menu" ref={root} data-tour={tour} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); triggerRef.current?.focus() }
  }} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close() }}>
    {trigger({ ref: triggerRef, 'aria-expanded': open, 'aria-controls': id, onClick: () => open ? close() : onOpen() })}
    {open && <div ref={panel} id={id} className="account-panel">{children}</div>}
  </div>
}

export default function Header({ isAdmin, logOut, email, onReportBug, onRequestFeature, organizationName, organizationLogoUrl, overdueReservations = 0 }: Props) {
  const [isOpen, setOpen] = useState(false), [menu, setMenu] = useState<Menu>(null)
  const accountTrigger = useRef<HTMLButtonElement>(null), helpTrigger = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null), menuTrigger = useRef<HTMLButtonElement>(null)
  const pathname = usePathname(), tour = useTour()
  const dismissDrawer = () => { setOpen(false); menuTrigger.current?.focus() }

  useEffect(() => {
    if (!isOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector<HTMLButtonElement>('.drawer-close')?.focus()
    const media = window.matchMedia?.('(min-width: 1024px)')
    const closeOnDesktop = () => { if (media?.matches) setOpen(false) }
    media?.addEventListener('change', closeOnDesktop)
    return () => { document.body.style.overflow = previous; media?.removeEventListener('change', closeOnDesktop) }
  }, [isOpen])

  // Section names never repeat a link inside them; the top group needs no heading. `tour` names the spotlight anchor.
  const groups = [
    { tour: 'overview', links: [{ to: '/', label: 'Home', Icon: HiOutlineHome }, { to: '/alerts', label: 'Alerts', Icon: HiOutlineBell }] },
    { tour: 'production', name: 'Production', links: [
      { to: '/production', label: 'Productions', Icon: HiOutlineVideoCamera },
      { to: '/production/calendar', label: 'Shoot calendar', Icon: HiOutlineCalendar },
    ] },
    { tour: 'equipment', name: 'Equipment', links: [
      { to: '/inventory', label: 'Inventory', Icon: HiOutlineArchiveBox },
      { to: '/calendar', label: 'Gear calendar', Icon: HiOutlineCalendarDays },
      { to: '/reservations', label: 'Reservations', Icon: HiOutlineClipboardDocumentList, related: ['/create-reservation', '/check-in-out'], badge: overdueReservations > 0 ? { count: overdueReservations, label: `${overdueReservations} overdue` } : undefined },
      { to: '/reports', label: 'Damage reports', Icon: HiOutlineWrenchScrewdriver, related: ['/create-report', '/report-summary'] },
    ] },
    ...(isAdmin ? [{ tour: 'administration', name: 'Admin', links: [
      { to: '/organization', label: 'Members', Icon: HiOutlineUsers, section: true },
      { to: '/statistics', label: 'Statistics', Icon: HiOutlineChartBar },
      { to: '/organization/settings', label: 'Settings', Icon: HiOutlineCog6Tooth, section: true },
    ] }] : []),
  ]
  const currentPath = pathname?.replace(/\/$/, '') || '/'
  // Members owns /organization/* except the settings pages, which Settings owns.
  const isActive = (link: { to: string; section?: boolean; related?: string[] }) => currentPath === link.to || !!link.related?.includes(currentPath)
    || (!!link.section && currentPath.startsWith(link.to + '/') && !(link.to === '/organization' && (currentPath === '/organization/settings' || currentPath.startsWith('/organization/settings/'))))
  const helpActive = currentPath === '/get-started' || currentPath === '/resources'
  const closeMenus = () => { setOpen(false); setMenu(null) }

  return <header className="site-header ws-shell">
    <a className="ws-skip-link" href="#workspace-content">Skip to workspace</a>
    <div className="site-header-inner">
      <Link href="/" className="brand-lockup" onClick={closeMenus}>{organizationName ? <>{organizationLogoUrl && <img className="brand-org-logo" src={organizationLogoUrl} alt="" />}<span className="brand-org-name" title={organizationName}>{organizationName}</span></> : <img src={StudioStack.src ?? StudioStack} alt="StudioStack" />}</Link>
      <button ref={menuTrigger} className="ws-menu-toggle" data-tour="menu-toggle" aria-label="Toggle navigation" aria-expanded={isOpen} aria-controls="workspace-navigation" onClick={() => { setOpen(open => !open); setMenu(null) }}><HiOutlineBars3 aria-hidden="true" /></button>
      {isOpen && <button className="ws-drawer-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={dismissDrawer} />}
      <div ref={drawerRef} id="workspace-navigation" className={`ws-sidebar-body ${isOpen ? 'is-open' : ''}`} role={isOpen ? 'dialog' : undefined} aria-modal={isOpen ? true : undefined} aria-label={isOpen ? 'Workspace navigation' : undefined} onKeyDown={event => {
        if (!isOpen) return
        if (event.key === 'Escape') { event.preventDefault(); dismissDrawer() }
        if (event.key === 'Tab') {
          const controls = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
          const first = controls[0], last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
      }}>
        <div className="ws-drawer-heading"><span>Navigation</span><button className="drawer-close" aria-label="Close navigation drawer" onClick={dismissDrawer}><HiOutlineXMark aria-hidden="true" /></button></div>
        <nav className={isOpen ? 'mobile-nav-links' : 'desktop-nav-links'} aria-label="Main navigation">
          {groups.map(group => <div className="ws-nav-group" key={group.tour} data-tour={`nav-${group.tour}`}>{group.name && <p>{group.name}</p>}{group.links.map(link => {
            const active = isActive(link)
            return <Link key={link.to} href={link.to} onClick={closeMenus} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><link.Icon aria-hidden="true" /><span>{link.label}</span>{'badge' in link && link.badge && <span className="nav-badge" title={link.badge.label}><span aria-hidden="true">{link.badge.count > 99 ? '99+' : link.badge.count}</span><span className="sr-only">{link.badge.label}</span></span>}</Link>
          })}</div>)}
        </nav>
        <div className="header-actions">
          <MenuPopover id="help-panel" tour="help" open={menu === 'help'} onOpen={() => setMenu('help')} onClose={() => setMenu(open => open === 'help' ? null : open)} triggerRef={helpTrigger}
            trigger={props => <button {...props} className={`nav-link help-trigger ${helpActive ? 'active' : ''}`}><HiOutlineQuestionMarkCircle aria-hidden="true" /><span>Help</span></button>}>
            <div className="account-identity"><strong>Help &amp; feedback</strong></div>
            <Link href="/get-started" onClick={closeMenus}><HiOutlineRocketLaunch aria-hidden="true" />Get started</Link>
            <Link href="/resources" onClick={closeMenus}><HiOutlineBookOpen aria-hidden="true" />Resources</Link>
            {tour && <button className="account-tour" onClick={() => { closeMenus(); tour.start('workspace') }}><HiOutlineSparkles aria-hidden="true" />Take the tour</button>}
            {onReportBug && <button className="account-report-bug" onClick={() => { closeMenus(); onReportBug() }}><HiOutlineBugAnt aria-hidden="true" />Report a bug</button>}
            {onRequestFeature && <button className="account-request-feature" onClick={() => { closeMenus(); onRequestFeature() }}><HiOutlineLightBulb aria-hidden="true" />Request a feature</button>}
          </MenuPopover>
          <MenuPopover id="account-panel" tour="account" open={menu === 'account'} onOpen={() => setMenu('account')} onClose={() => setMenu(open => open === 'account' ? null : open)} triggerRef={accountTrigger}
            trigger={props => <button {...props} className="account-trigger" aria-label="Account"><HiOutlineUserCircle aria-hidden="true" /><span>Account<small>{email || 'Your workspace'}</small></span><HiOutlineChevronDown className="account-chevron" aria-hidden="true" /></button>}>
            <div className="account-identity"><strong>Your account</strong></div>
            <Link href="/account" onClick={closeMenus}><HiOutlineUserCircle aria-hidden="true" />Account &amp; workspaces</Link>
            <button className="account-signout" onClick={() => { closeMenus(); void logOut() }}><HiOutlineArrowRightOnRectangle aria-hidden="true" />Sign out</button>
          </MenuPopover>
        </div>
      </div>
    </div>
  </header>
}
