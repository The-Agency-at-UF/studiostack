import { render, screen } from '@testing-library/react';
import Header from './Header';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('Header', () => {
  it('renders StudioStack logo', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    expect(screen.getByAltText('StudioStack')).toBeInTheDocument();
  });

  it('shows Admin-only links when isAdmin is true', () => {
    render(<Header isAdmin={true} logOut={() => {}} />);
    // These should only be visible for admins
    expect(screen.getAllByText('Statistics')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Users')[0]).toBeInTheDocument();
  });

  it('does not show Admin-only links when isAdmin is false', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    // These should NOT be visible for students
    expect(screen.queryByText('Statistics')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('shows common links for both roles', () => {
    render(<Header isAdmin={false} logOut={() => {}} />);
    expect(screen.getAllByText('Home')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Inventory')[0]).toBeInTheDocument();
  });
});
