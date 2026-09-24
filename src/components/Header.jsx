import React, {useState} from 'react'
import Hamburger from 'hamburger-react'
import StudioStack from '../assets/StudioStack.png'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { IoIosLogOut } from "react-icons/io";
import { HiOutlineArrowUpRight } from "react-icons/hi2";

function Header({ isAdmin, logOut }) {

  const [isOpen, setOpen] = useState(false);
  const pathname = usePathname();

  const links = [
    { to: '/', label: 'Home' },
    { to: '/calendar', label: 'Calendar' },
    { to: '/reservations', label: 'Reservations', related: ['/create-reservation', '/check-in-out'] },
    { to: '/reports', label: 'Reports', related: ['/create-report', '/report-summary'] },
    { to: '/teams', label: 'Teams' },
    { to: '/inventory', label: 'Inventory' },
    ...(isAdmin ? [
      { to: '/statistics', label: 'Statistics' },
      { to: '/users', label: 'Users' },
    ] : []),
  ];

  const NavLinks = ({ mobile = false }) => (
    <div className={mobile ? 'mobile-nav-links' : 'desktop-nav-links'}>
      {links.map((link) => {
        const isActive = pathname === link.to || link.related?.includes(pathname)
        return (
          <Link
            key={link.to}
            href={link.to}
            onClick={() => setOpen(false)}
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
          <span>Production desk</span>
        </Link>

        <NavLinks />

        <div className="header-actions">
          <span className="access-label">{isAdmin ? 'Admin access' : 'Student access'}</span>
          <Link href="/create-reservation" className="header-cta">
            Book gear <HiOutlineArrowUpRight />
          </Link>
          <button className="logout-button" onClick={logOut} aria-label="Log out">
            <IoIosLogOut />
          </button>
        </div>

        <div className="mobile-menu-toggle">
          <Hamburger color='white' size={24} toggled={isOpen} toggle={setOpen} label="Toggle navigation" />
        </div>
      </div>

      {isOpen && <NavLinks mobile />}
    </nav>
  )
}

export default Header;
