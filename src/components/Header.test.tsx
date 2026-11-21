import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';
import { TourProvider } from './tour/TourContext';
import { afterEach, describe, it, expect, vi } from 'vitest';

const nav = vi.hoisted(() => ({ path: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.path,
}));

describe('Header', () => {
  it.each(['Home','Productions','Shoot calendar','Gear calendar','Reservations','Damage reports','Alerts','Inventory','Members','Statistics','Settings'])('preserves the %s link between pointer-down and click when dismissing the account menu', async (name) => {
    const user = userEvent.setup(); const logOut = vi.fn(); const view = render(<Header isAdmin logOut={logOut} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const link = screen.getByRole('link', { name }); const clicked = vi.fn(); link.addEventListener('click', clicked);
    fireEvent.pointerDown(link);
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name })).toBe(link);
    fireEvent.click(link); expect(clicked).toHaveBeenCalledOnce();
    view.rerender(<Header isAdmin logOut={logOut} email="updated@example.test" />);
    expect(screen.getByRole('link', { name })).toBe(link);
  });

  it('keeps mobile links mounted through header updates and closes the menu after navigation', async () => {
    const user=userEvent.setup(), logOut=vi.fn();const view=render(<Header isAdmin={false} logOut={logOut} />);
    await user.click(screen.getByRole('button',{name:'Toggle navigation'}));
    const mobile=view.container.querySelector('.mobile-nav-links')!;
    const link=Array.from(mobile.querySelectorAll('a')).find(a=>a.textContent==='Damage reports')!;
    view.rerender(<Header isAdmin={false} logOut={logOut} email="member@example.test" />);
    expect(link.isConnected).toBe(true);expect(view.container.querySelector('.mobile-nav-links')).toBe(mobile);
    await user.click(link);expect(view.container.querySelector('.mobile-nav-links')).toBeNull();expect(logOut).not.toHaveBeenCalled();
  });

  it('renders StudioStack logo', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    expect(screen.getByAltText('StudioStack')).toBeInTheDocument();
    expect(screen.queryByText('Production desk')).not.toBeInTheDocument();
    expect(screen.queryByText(/Admin access|Student access/)).not.toBeInTheDocument();
  });

  it('shows the organization name in place of the logo', () => {
    render(<Header isAdmin={false} logOut={() => {}} organizationName="The Agency at UF" />);
    const name = screen.getByText('The Agency at UF');
    expect(name).toHaveAttribute('title', 'The Agency at UF');
    expect(name.closest('a')).toHaveAttribute('href', '/');
    expect(screen.queryByAltText('StudioStack')).not.toBeInTheDocument();
  });

  it('shows the workspace logo beside the organization name', () => {
    const { container } = render(<Header isAdmin={false} logOut={() => {}} organizationName="The Agency at UF" organizationLogoUrl="https://example.test/logo.png" />);
    expect(container.querySelector('.brand-lockup img.brand-org-logo')).toHaveAttribute('src', 'https://example.test/logo.png');
    expect(screen.getByText('The Agency at UF')).toBeInTheDocument();
  });

  it('badges the Reservations link with the overdue count', () => {
    const view = render(<Header isAdmin={false} logOut={() => {}} overdueReservations={2} />);
    expect(screen.getByRole('link', { name: 'Reservations 2 overdue' })).toHaveAttribute('href', '/reservations');
    view.rerender(<Header isAdmin={false} logOut={() => {}} overdueReservations={0} />);
    expect(screen.getByRole('link', { name: 'Reservations' })).toBeInTheDocument();
    expect(view.container.querySelector('.nav-badge')).toBeNull();
  });

  it('shows Admin-only links when isAdmin is true', () => {
    render(<Header isAdmin={true} logOut={() => {}} />);
    // These should only be visible for admins
    expect(screen.getAllByText('Statistics')[0]).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Teams' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('href', '/organization');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/organization/settings');
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('does not show Admin-only links when isAdmin is false', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    // These should NOT be visible for students
    expect(screen.queryByText('Statistics')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Members')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows common links for both roles', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    expect(screen.getAllByText('Home')[0]).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory');
  });

  it('names sections without repeating their links and leaves the top group unlabeled', () => {
    const { container } = render(<Header isAdmin logOut={() => {}} />);
    const headings = Array.from(container.querySelectorAll('.desktop-nav-links .ws-nav-group > p')).map(p => p.textContent);
    expect(headings).toEqual(['Production', 'Equipment', 'Admin']);
    expect(container.querySelector('[data-tour="nav-overview"] > p')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Get Started' })).not.toBeInTheDocument();
  });

  it.each([
    ['/organization', 'Members'],
    ['/organization/roles', 'Members'],
    ['/organization/settings', 'Settings'],
    ['/organization/settings/join-codes', 'Settings'],
  ])('marks only one admin link current on %s', (path, current) => {
    nav.path = path;
    try {
      render(<Header isAdmin logOut={() => {}} />);
      expect(screen.getAllByRole('link', { current: 'page' }).map(link => link.textContent)).toEqual([current]);
    } finally { nav.path = '/'; }
  });

  it('opens account actions, closes with Escape, and restores focus', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin logOut={vi.fn()} email="preview@example.com" />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('preview@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account & workspaces' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
  });

  it('hides organization account actions from non-admins and signs out', async () => {
    const user = userEvent.setup();
    const logOut = vi.fn();
    render(<Header isAdmin={false} logOut={logOut} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logOut).toHaveBeenCalledOnce();
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
  });

  it('dismisses account actions outside the menu and after navigation', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin logOut={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    await user.click(trigger);
    await user.click(screen.getByAltText('StudioStack'));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    await user.click(screen.getByRole('link', { name: 'Account & workspaces' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps Account & workspaces mounted through a pointer blur so its navigation can finish', async () => {
    const user = userEvent.setup();
    const logOut = vi.fn();
    render(<Header isAdmin logOut={logOut} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const link = screen.getByRole('link', { name: 'Account & workspaces' });
    expect(link).toHaveAttribute('href', '/account');
    fireEvent.blur(link, { relatedTarget: null });
    expect(link).toBeInTheDocument();
    await user.click(link);
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-expanded', 'false');
    expect(logOut).not.toHaveBeenCalled();
  });

  it.each([true, false])('keeps only personal actions in the account menu (admin: %s)', async isAdmin => {
    const user = userEvent.setup();
    render(<Header isAdmin={isAdmin} logOut={vi.fn()} onReportBug={() => {}} onRequestFeature={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const panel = document.getElementById('account-panel')!;
    expect(Array.from(panel.querySelectorAll('a,button')).map(el => el.textContent)).toEqual(['Account & workspaces', 'Sign out']);
  });

  it('still dismisses the menu when keyboard focus leaves it', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin logOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.blur(screen.getByRole('link', { name: 'Account & workspaces' }), { relatedTarget: screen.getByRole('button', { name: 'Help' }) });
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
  });
});

describe('Workspace drawer accessibility', () => {
  it('contains keyboard focus, dismisses with Escape, and restores its trigger', async () => {
    const user=userEvent.setup();render(<Header isAdmin logOut={vi.fn()}/>);
    const trigger=screen.getByRole('button',{name:'Toggle navigation'});
    await user.click(trigger);
    expect(screen.getByRole('dialog',{name:'Workspace navigation'})).toHaveAttribute('aria-modal','true');
    const close=screen.getByRole('button',{name:'Close navigation drawer'});
    expect(close).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button',{name:'Account'})).toHaveFocus();
    await user.keyboard('{Tab}');expect(close).toHaveFocus();
    await user.keyboard('{Escape}');expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded','false');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('Header tour', () => {
  afterEach(() => vi.restoreAllMocks());
  const titles = async (isAdmin: boolean) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 10, 100, 40));
    const user = userEvent.setup();
    render(<TourProvider owner="member" isAdmin={isAdmin} autoStart={false}><Header isAdmin={isAdmin} logOut={() => {}} /></TourProvider>);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    await user.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(screen.getByRole('button', { name: 'Help' })).toHaveAttribute('aria-expanded', 'false');
    const seen: string[] = [];
    while (screen.queryByRole('dialog')) { seen.push(screen.getByRole('heading', { level: 2 }).textContent!); await user.click(screen.getByRole('button', { name: /Next|Finish/ })); }
    return seen;
  };

  it('replays the workspace tour from the Help menu and highlights each sidebar area', async () => {
    expect(await titles(true)).toEqual(['Welcome to StudioStack', 'Open the menu', 'Start at Home', 'Plan productions', 'Find and track gear', 'Run your workspace', 'Get help', 'Your account', 'You’re all set']);
  });

  it('leaves the administration step out for members', async () => {
    expect(await titles(false)).not.toContain('Run your workspace');
  });

  it('offers no tour outside the workspace shell', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin={false} logOut={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.queryByRole('button', { name: 'Take the tour' })).not.toBeInTheDocument();
  });
  it('opens Get started and Resources from the Help menu', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin={false} logOut={() => {}} />);
    const help = screen.getByRole('button', { name: 'Help' });
    await user.click(help);
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Resources' })).toHaveAttribute('href', '/resources');
    await user.click(screen.getByRole('link', { name: 'Get started' }));
    expect(help).toHaveAttribute('aria-expanded', 'false');
  });
  it('closes the Help menu with Escape and opening Account replaces it', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin={false} logOut={() => {}} />);
    const help = screen.getByRole('button', { name: 'Help' });
    await user.click(help);
    await user.keyboard('{Escape}');
    expect(help).toHaveFocus();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    await user.click(help);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-expanded', 'true');
  });
  it('places Report a bug after Resources and opens it', async () => {
    const user = userEvent.setup(), onReportBug = vi.fn();
    render(<Header isAdmin={false} logOut={() => {}} onReportBug={onReportBug} />);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    const report = screen.getByRole('button', { name: 'Report a bug' });
    expect(screen.getByRole('link', { name: 'Resources' }).nextElementSibling).toBe(report);
    await user.click(report);
    expect(onReportBug).toHaveBeenCalledOnce();
    expect(screen.queryByText('Help & feedback')).not.toBeInTheDocument();
  });
  it('places Request a feature directly under Report a bug and opens it', async () => {
    const user = userEvent.setup(), onRequestFeature = vi.fn();
    render(<Header isAdmin={false} logOut={() => {}} onReportBug={() => {}} onRequestFeature={onRequestFeature} />);
    await user.click(screen.getByRole('button', { name: 'Help' }));
    const request = screen.getByRole('button', { name: 'Request a feature' });
    expect(screen.getByRole('button', { name: 'Report a bug' }).nextElementSibling).toBe(request);
    await user.click(request);
    expect(onRequestFeature).toHaveBeenCalledOnce();
    expect(screen.queryByText('Help & feedback')).not.toBeInTheDocument();
  });
});
