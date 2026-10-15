import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('Header', () => {
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
    expect(screen.getByRole('link', { name: 'My reservations' })).toHaveFocus();
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
