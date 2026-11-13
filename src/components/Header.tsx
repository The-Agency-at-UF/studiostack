import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTour } from './tour/TourContext'
import StudioStack from '../assets/StudioStack.png'
import { HiOutlineArrowUpRight, HiOutlineUserCircle, HiOutlineChevronDown, HiOutlineCalendarDays, HiOutlineCalendar, HiOutlineCog6Tooth, HiOutlineUsers, HiOutlineHome, HiOutlineBell, HiOutlineVideoCamera, HiOutlineArchiveBox, HiOutlineClipboardDocumentList, HiOutlineExclamationCircle, HiOutlineChartBar, HiOutlineBuildingOffice2, HiOutlineBars3, HiOutlineXMark, HiOutlineArrowRightOnRectangle, HiOutlineSparkles, HiOutlineBugAnt, HiOutlineLightBulb } from 'react-icons/hi2'
import { closeWithExit } from './workspace/closeWithExit'
import '../styles/shell.css'

type Props = { isAdmin: boolean; logOut: () => void | Promise<void>; email?: string; onReportBug?: () => void; onRequestFeature?: () => void; organizationName?: string; organizationLogoUrl?: string | null }

export default function Header({ isAdmin, logOut, email, onReportBug, onRequestFeature, organizationName, organizationLogoUrl }: Props) {
  const [isOpen, setOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null), accountTrigger = useRef<HTMLButtonElement>(null), accountPanel = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null), menuTrigger = useRef<HTMLButtonElement>(null)
  const pathname = usePathname(), tour = useTour()
  const dismissDrawer = () => { setOpen(false); menuTrigger.current?.focus() }
  // The account menu plays its exit before unmounting; navigation from inside it closes at once.
  const closeAccount = () => closeWithExit(accountPanel.current, () => setAccountOpen(false))

  useEffect(() => {
    if (!accountOpen) return
    accountRef.current?.querySelector<HTMLAnchorElement>('.account-panel a')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) closeAccount()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [accountOpen])

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

  const groups = [
    { name: 'Overview', links: [{ to: '/', label: 'Home', Icon: HiOutlineHome }, { to: '/alerts', label: 'Alerts', Icon: HiOutlineBell }] },
    { name: 'Production', links: [
      { to: '/production', label: 'Production', Icon: HiOutlineVideoCamera },
      { to: '/production/calendar', label: 'Production calendar', Icon: HiOutlineCalendar },
    ] },
    { name: 'Equipment', links: [
      { to: '/inventory', label: 'Equipment', Icon: HiOutlineArchiveBox },
      { to: '/calendar', label: 'Equipment calendar', Icon: HiOutlineCalendarDays },
      { to: '/reservations', label: 'Reservations', Icon: HiOutlineClipboardDocumentList, related: ['/create-reservation', '/check-in-out'] },
      { to: '/reports', label: 'Reports', Icon: HiOutlineExclamationCircle, related: ['/create-report', '/report-summary'] },
    ] },
    ...(isAdmin ? [{ name: 'Administration', links: [
      { to: '/statistics', label: 'Statistics', Icon: HiOutlineChartBar },
      { to: '/organization', label: 'Organization', Icon: HiOutlineBuildingOffice2 },
    ] }] : []),
  ]
  const currentPath = pathname?.replace(/\/$/, '') || '/'
  const closeMenus = () => { setOpen(false); setAccountOpen(false) }

  return <header className="site-header ws-shell">
    <a className="ws-skip-link" href="#workspace-content">Skip to workspace</a>
    <div className="site-header-inner">
      <Link href="/" className="brand-lockup" onClick={closeMenus}>{organizationName ? <>{organizationLogoUrl && <img className="brand-org-logo" src={organizationLogoUrl} alt="" />}<span className="brand-org-name" title={organizationName}>{organizationName}</span></> : <img src={StudioStack.src ?? StudioStack} alt="StudioStack" />}</Link>
      <button ref={menuTrigger} className="ws-menu-toggle" data-tour="menu-toggle" aria-label="Toggle navigation" aria-expanded={isOpen} aria-controls="workspace-navigation" onClick={() => { setOpen(open => !open); setAccountOpen(false) }}><HiOutlineBars3 aria-hidden="true" /></button>
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
          {groups.map(group => <div className="ws-nav-group" key={group.name} data-tour={`nav-${group.name.toLowerCase()}`}><p>{group.name}</p>{group.links.map(link => {
            const active = currentPath === link.to || (link.to === '/organization' && currentPath.startsWith('/organization/')) || ('related' in link && link.related?.includes(currentPath))
            return <Link key={link.to} href={link.to} onClick={closeMenus} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><link.Icon aria-hidden="true" /><span>{link.label}</span></Link>
          })}</div>)}
        </nav>
        <div className="header-actions">
          <Link href="/create-reservation" className="header-cta" data-tour="book-gear" onClick={closeMenus}>Book gear <HiOutlineArrowUpRight aria-hidden="true" /></Link>
          <div className="account-menu" ref={accountRef} data-tour="account" onKeyDown={event => {
            if (event.key === 'Escape' && accountOpen) { event.stopPropagation(); closeAccount(); accountTrigger.current?.focus() }
          }} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) closeAccount() }}>
            <button ref={accountTrigger} className="account-trigger" aria-label="Account" aria-expanded={accountOpen} aria-controls="account-panel" onClick={() => accountOpen ? closeAccount() : setAccountOpen(true)}><HiOutlineUserCircle aria-hidden="true" /><span>Account<small>{email || 'Your workspace'}</small></span><HiOutlineChevronDown className="account-chevron" aria-hidden="true" /></button>
            {accountOpen && <div ref={accountPanel} id="account-panel" className="account-panel">
              <div className="account-identity"><strong>Your account</strong></div>
              <Link href="/account" onClick={closeMenus}><HiOutlineUserCircle aria-hidden="true" />Account & workspaces</Link>
              <Link href="/reservations" onClick={closeMenus}><HiOutlineCalendarDays aria-hidden="true" />My reservations</Link>
              {isAdmin && <><Link href="/organization" onClick={closeMenus}><HiOutlineUsers aria-hidden="true" />Manage members</Link><Link href="/organization/settings" onClick={closeMenus}><HiOutlineCog6Tooth aria-hidden="true" />Organization settings</Link></>}
              {onReportBug && <button className="account-report-bug" onClick={() => { closeMenus(); onReportBug() }}><HiOutlineBugAnt aria-hidden="true" />Report a bug</button>}
              {onRequestFeature && <button className="account-request-feature" onClick={() => { closeMenus(); onRequestFeature() }}><HiOutlineLightBulb aria-hidden="true" />Request a feature</button>}
              {tour && <button className="account-tour" onClick={() => { closeMenus(); tour.start('workspace') }}><HiOutlineSparkles aria-hidden="true" />Take the tour</button>}
              <button className="account-signout" onClick={() => { closeMenus(); void logOut() }}><HiOutlineArrowRightOnRectangle aria-hidden="true" />Sign out</button>
            </div>}
          </div>
        </div>
      </div>
    </div>
  </header>
}
