import { render, screen, waitFor } from '@testing-library/react';
import Users from './Users';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocs } from 'firebase/firestore';

// Mock components
vi.mock('../../components/AddUserPopup', () => ({
  default: () => <div data-testid="add-user-popup">Add User</div>
}));
vi.mock('../../components/RemoveUserPopUp', () => ({
  default: () => <div data-testid="remove-user-popup">Remove User</div>
}));
vi.mock('../../components/ConfirmationPopup', () => ({
  default: ({ handle, text }) => <button data-testid="confirm-popup" onClick={handle}>{text}</button>
}));

describe('Users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "You must be an admin" for non-admin users', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });
    render(<Users isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText('You must be an admin to view this page.')).toBeInTheDocument();
    });
  });

  it('renders users list for admin users', async () => {
    const mockUsers = [
      { id: 'admin@ufl.edu', data: () => ({ isAdmin: true }) },
      { id: 'student@ufl.edu', data: () => ({ isAdmin: false }) }
    ];

    vi.mocked(getDocs).mockResolvedValue({ docs: mockUsers });

    render(<Users isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText('admin@ufl.edu')).toBeInTheDocument();
      expect(screen.getByText('student@ufl.edu')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Student')).toBeInTheDocument();
    });
  });

  it('shows add and remove popups for admins', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });
    render(<Users isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('add-user-popup')).toBeInTheDocument();
      expect(screen.getByTestId('remove-user-popup')).toBeInTheDocument();
    });
  });
});
