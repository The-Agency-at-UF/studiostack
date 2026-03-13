import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocs } from 'firebase/firestore';

// Mock child components to simplify testing
vi.mock('../../components/AdminDash', () => ({
  default: () => <div data-testid="admin-dash">Admin Dash</div>
}));
vi.mock('../../components/StudentDash', () => ({
  default: () => <div data-testid="student-dash">Student Dash</div>
}));
vi.mock('../../components/UpcomingReservationLabel', () => ({
  default: ({ reservation }) => <div data-testid="reservation-label">{reservation.reservationId}</div>
}));

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('email', 'test@ufl.edu');
  });

  it('renders AdminDash for admin users', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });
    render(<Dashboard isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-dash')).toBeInTheDocument();
    });
  });

  it('renders StudentDash for student users', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });
    render(<Dashboard isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('student-dash')).toBeInTheDocument();
    });
  });

  it('displays upcoming reservations for the current user', async () => {
    const mockReservations = [
      {
        id: 'res1',
        data: () => ({
          userEmail: 'test@ufl.edu',
          startDate: { toDate: () => new Date('2026-03-20') },
          endDate: { toDate: () => new Date('2026-03-25') },
          equipmentIDs: [{ id: 'item1', name: 'Camera' }]
        })
      }
    ];

    vi.mocked(getDocs).mockResolvedValue({ docs: mockReservations });

    render(<Dashboard isAdmin={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('reservation-label')).toBeInTheDocument();
      expect(screen.getByText('Camera')).toBeInTheDocument();
    });
  });

  it('displays no reservations message when list is empty', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });

    render(<Dashboard isAdmin={false} />);

    await waitFor(() => {
      expect(screen.getByText('You have no upcoming reservations!')).toBeInTheDocument();
    });
  });
});
