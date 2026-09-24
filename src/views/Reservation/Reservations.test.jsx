import { render, screen, waitFor } from '@testing-library/react';
import Reservations from './Reservations';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocs } from 'firebase/firestore';

// Mock components
vi.mock('../../components/ReservationLabel', () => ({
  default: ({ reservation }) => <div data-testid="reservation-label">{reservation.reservationId}</div>
}));
vi.mock('../../components/StudentNotification', () => ({
  default: ({ notification }) => <div data-testid="notification">{notification.id}</div>
}));
vi.mock('../../components/ConfirmationPopup', () => ({
  default: ({ handle }) => <button onClick={handle}>Delete</button>
}));

const mockNavigate = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockNavigate }),
}));

describe('Reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('email', 'test@ufl.edu');
    localStorage.setItem('isAdmin', 'false');
  });

  it('renders "no active reservations" when empty', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });

    render(<Reservations isAdmin={false} />);

    await waitFor(() => {
      expect(screen.getByText('You have no active reservations!')).toBeInTheDocument();
    });
  });

  it('renders active and past reservations', async () => {
    const mockDocs = [
      {
        id: 'res-active',
        data: () => ({
          userEmail: 'test@ufl.edu',
          startDate: { toDate: () => new Date('2026-03-20') },
          endDate: { toDate: () => new Date('2026-03-25') },
        })
      },
      {
        id: 'res-past',
        data: () => ({
          userEmail: 'test@ufl.edu',
          startDate: { toDate: () => new Date('2026-03-01') },
          endDate: { toDate: () => new Date('2026-03-05') },
        })
      }
    ];

    vi.mocked(getDocs).mockImplementation((ref) => {
        if (ref._path?.segments?.includes('notifications')) {
            return Promise.resolve({ docs: [] });
        }
        return Promise.resolve({ docs: mockDocs });
    });

    render(<Reservations isAdmin={false} />);

    await waitFor(() => {
      const labels = screen.getAllByTestId('reservation-label');
      expect(labels).toHaveLength(2);
      expect(screen.getByText('res-active')).toBeInTheDocument();
      expect(screen.getByText('res-past')).toBeInTheDocument();
    });
  });
});
