import React, {useState} from 'react'
import Hamburger from 'hamburger-react'
import StudioStack from '../assets/StudioStack.png'
import { NavLink, useLocation, Link } from 'react-router-dom'
import { IoIosLogOut } from "react-icons/io";
import { HiOutlineArrowUpRight } from "react-icons/hi2";

function Header({ isAdmin, logOut }) {

  const [isOpen, setOpen] = useState(false);
  const { pathname } = useLocation();
  
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

  const navLinkClass = (link) => ({ isActive }) =>
    isActive || link.related?.includes(pathname) ? 'nav-link active' : 'nav-link';

  const NavLinks = ({ mobile = false }) => (
    <div className={mobile ? 'mobile-nav-links' : 'desktop-nav-links'}>
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} onClick={() => setOpen(false)} className={navLinkClass(link)}>
          {link.label}
        </NavLink>
      ))}
    </div>
  );

  return (
    <nav className='site-header'>
      <div className='site-header-inner'>
        <Link to="/" className="brand-lockup">
          <img src={StudioStack} alt="StudioStack"/>
          <span>Production desk</span>
        </Link>

        <NavLinks />

        <div className="header-actions">
          <span className="access-label">{isAdmin ? 'Admin access' : 'Student access'}</span>
          <Link to="/create-reservation" className="header-cta">
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
