import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('Header', () => {
  it.each(['Home','Production','Gear calendar','Reservations','Reports','Alerts','Inventory','Statistics','Users','Organization'])('preserves the %s link between pointer-down and click when dismissing the account menu', async (name) => {
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
    const link=Array.from(mobile.querySelectorAll('a')).find(a=>a.textContent==='Reports')!;
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

  it('shows Admin-only links when isAdmin is true', () => {
    render(<Header isAdmin={true} logOut={() => {}} />);
    // These should only be visible for admins
    expect(screen.getAllByText('Statistics')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Users')[0]).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Organization' })).toHaveAttribute('href', '/organization');
  });

  it('does not show Admin-only links when isAdmin is false', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    // These should NOT be visible for students
    expect(screen.queryByText('Statistics')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Organization')).not.toBeInTheDocument();
  });

  it('shows common links for both roles', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    expect(screen.getAllByText('Home')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Inventory')[0]).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'Organization settings' })).toHaveAttribute('href', '/organization/settings');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByText('Your account')).not.toBeInTheDocument();
  });

  it('hides organization account actions from non-admins and signs out', async () => {
    const user = userEvent.setup();
    const logOut = vi.fn();
    render(<Header isAdmin={false} logOut={logOut} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.queryByText('Organization settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Manage members')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('link', { name: 'Organization settings' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it.each([
    ['My reservations', '/reservations'],
    ['Manage members', '/organization'],
    ['Organization settings', '/organization/settings'],
  ])('keeps %s mounted through a pointer blur so its navigation can finish', async (name, href) => {
    const user = userEvent.setup();
    const logOut = vi.fn();
    render(<Header isAdmin logOut={logOut} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    fireEvent.blur(screen.getByRole('link', { name: 'My reservations' }), { relatedTarget: null });
    expect(link).toBeInTheDocument();
    await user.click(link);
    expect(screen.getByRole('button', { name: 'Account' })).toHaveAttribute('aria-expanded', 'false');
    expect(logOut).not.toHaveBeenCalled();
  });

  it('still dismisses the menu when keyboard focus leaves it', async () => {
    const user = userEvent.setup();
    render(<Header isAdmin logOut={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.blur(screen.getByRole('link', { name: 'My reservations' }), { relatedTarget: screen.getByRole('link', { name: 'Book gear' }) });
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
