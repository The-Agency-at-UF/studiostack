import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
import { describe, it, expect } from 'vitest';

describe('Header', () => {
  it('renders StudioStack logo', () => {
    render(
      <MemoryRouter>
        <Header isAdmin={false} logOut={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByAltText('StudioStack')).toBeInTheDocument();
  });

  it('shows Admin-only links when isAdmin is true', () => {
    render(
      <MemoryRouter>
        <Header isAdmin={true} logOut={() => {}} />
      </MemoryRouter>
    );
    // These should only be visible for admins
    expect(screen.getAllByText('Statistics')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Users')[0]).toBeInTheDocument();
  });

  it('does not show Admin-only links when isAdmin is false', () => {
    render(
      <MemoryRouter>
        <Header isAdmin={false} logOut={() => {}} />
      </MemoryRouter>
    );
    // These should NOT be visible for students
    expect(screen.queryByText('Statistics')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('shows common links for both roles', () => {
    render(
      <MemoryRouter>
        <Header isAdmin={false} logOut={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Home')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Inventory')[0]).toBeInTheDocument();
  });
});
