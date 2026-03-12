import { render, screen } from '@testing-library/react';
import Teams from './Teams';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';

// Mock components
vi.mock('../../components/AddTeamPopup', () => ({
  default: () => <div data-testid="add-team-popup">Add Team</div>
}));
vi.mock('../../components/RemoveTeamPopup', () => ({
  default: () => <div data-testid="remove-team-popup">Remove Team</div>
}));

describe('Teams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders teams list from onSnapshot', () => {
    vi.mocked(onSnapshot).mockImplementation((q, callback) => {
      callback({
        docs: [
          { id: 'Team A', data: () => ({ type: 'Client' }) },
          { id: 'Team B', data: () => ({ type: 'Internal' }) },
        ]
      });
      return () => {};
    });

    render(<Teams isAdmin={false} />);
    
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  it('shows add and remove popups for admins', () => {
    render(<Teams isAdmin={true} />);
    expect(screen.getByTestId('add-team-popup')).toBeInTheDocument();
    expect(screen.getByTestId('remove-team-popup')).toBeInTheDocument();
  });

  it('hides add and remove popups for non-admins', () => {
    render(<Teams isAdmin={false} />);
    expect(screen.queryByTestId('add-team-popup')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remove-team-popup')).not.toBeInTheDocument();
  });
});
