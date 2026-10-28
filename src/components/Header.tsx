import { useEffect, useRef, useState } from 'react'
import Hamburger from 'hamburger-react'
import StudioStack from '../assets/StudioStack.png'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IoIosLogOut } from "react-icons/io";
import { HiOutlineArrowUpRight, HiOutlineUserCircle, HiOutlineChevronDown, HiOutlineCalendarDays, HiOutlineCog6Tooth, HiOutlineUsers } from "react-icons/hi2";

function Header({ isAdmin, logOut, email }: { isAdmin: boolean; logOut: () => void | Promise<void>; email?: string }) {

  const [isOpen, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!accountOpen) return;
    accountRef.current?.querySelector<HTMLAnchorElement>('.account-panel a')?.focus();
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRef.current?.contains(event.target)) setAccountOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [accountOpen]);

  const links = [
    { to: '/', label: 'Home' },
    { to: '/production', label: 'Production' },
    { to: '/calendar', label: 'Gear calendar' },
    { to: '/reservations', label: 'Reservations', related: ['/create-reservation', '/check-in-out'] },
    { to: '/reports', label: 'Reports', related: ['/create-report', '/report-summary'] },
    { to: '/teams', label: 'Teams' },
    { to: '/alerts', label: 'Alerts' },
    { to: '/inventory', label: 'Inventory' },
    ...(isAdmin ? [
      { to: '/statistics', label: 'Statistics' },
      { to: '/users', label: 'Users' },
      { to: '/organization', label: 'Organization' },
    ] : []),
  ];

  const NavLinks = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={mobile ? 'mobile-nav-links' : 'desktop-nav-links'}>
      {links.map((link) => {
        const isActive = pathname === link.to || (link.to === '/organization' && pathname.startsWith('/organization/')) || link.related?.includes(pathname)
        return (
          <Link
            key={link.to}
            href={link.to}
            onClick={() => { setOpen(false); setAccountOpen(false); }}
            className={isActive ? 'nav-link active' : 'nav-link'}
            aria-current={isActive ? 'page' : undefined}
          >
            {link.label}
          </Link>
        )
      })}
    </div>
  );

  return (
    <nav className='site-header'>
      <div className='site-header-inner'>
        <Link href="/" className="brand-lockup">
          <img src={StudioStack.src ?? StudioStack} alt="StudioStack"/>
        </Link>

        <NavLinks />

        <div className="mobile-menu-toggle">
          <Hamburger color='white' size={24} toggled={isOpen} toggle={open => { setOpen(open); setAccountOpen(false); }} label="Toggle navigation" />
        </div>

        <div className="header-actions">
          <Link href="/create-reservation" className="header-cta">
            Book gear <HiOutlineArrowUpRight />
          </Link>
          <div className="account-menu" ref={accountRef} onKeyDown={event => {
            if (event.key === 'Escape') { setAccountOpen(false); accountTrigger.current?.focus(); }
          }} onBlur={event => {
            // Some browsers blur focused links to the page during a pointer click.
            // A null destination must not unmount the link before its click fires;
            // outside pointer events and Escape already dismiss the disclosure.
            if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
          }}>
            <button ref={accountTrigger} className="account-trigger" aria-label="Account" aria-expanded={accountOpen} aria-controls="account-panel" onClick={() => {
              setAccountOpen(open => !open); setOpen(false);
            }}><HiOutlineUserCircle aria-hidden="true" /><HiOutlineChevronDown className="account-chevron" aria-hidden="true" /></button>
            {accountOpen && <div id="account-panel" className="account-panel">
              <div className="account-identity"><strong>Your account</strong>{email && <span>{email}</span>}</div>
              <Link href="/reservations" onClick={() => setAccountOpen(false)}><HiOutlineCalendarDays aria-hidden="true" /> My reservations</Link>
              {isAdmin && <>
                <Link href="/organization" onClick={() => setAccountOpen(false)}><HiOutlineUsers aria-hidden="true" /> Manage members</Link>
                <Link href="/organization/settings" onClick={() => setAccountOpen(false)}><HiOutlineCog6Tooth aria-hidden="true" /> Organization settings</Link>
              </>}
              <button className="account-signout" onClick={() => { setAccountOpen(false); void logOut(); }}><IoIosLogOut aria-hidden="true" /> Sign out</button>
            </div>}
          </div>
        </div>
      </div>

      {isOpen && <NavLinks mobile />}
    </nav>
  )
}

export default Header;
