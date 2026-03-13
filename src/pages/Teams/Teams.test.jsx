import { render, screen, waitFor } from '@testing-library/react';
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

  it('renders teams list from onSnapshot', async () => {
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
    
    await waitFor(() => {
      expect(screen.getByText('Team A')).toBeInTheDocument();
      expect(screen.getByText('Client')).toBeInTheDocument();
      expect(screen.getByText('Team B')).toBeInTheDocument();
      expect(screen.getByText('Internal')).toBeInTheDocument();
    });
  });

  it('shows add and remove popups for admins', async () => {
    render(<Teams isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('add-team-popup')).toBeInTheDocument();
      expect(screen.getByTestId('remove-team-popup')).toBeInTheDocument();
    });
  });

  it('hides add and remove popups for non-admins', async () => {
    render(<Teams isAdmin={false} />);
    await waitFor(() => {
      expect(screen.queryByTestId('add-team-popup')).not.toBeInTheDocument();
      expect(screen.queryByTestId('remove-team-popup')).not.toBeInTheDocument();
    });
  });
});
