import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Calendar from './Calendar';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocs } from 'firebase/firestore';

// Mock FullCalendar
vi.mock('@fullcalendar/react', () => ({
  default: ({ events, eventClick }) => (
    <div data-testid="full-calendar">
      {events.map(event => (
        <button key={event.id} onClick={() => eventClick({ event: { ...event, extendedProps: event } })}>
          {event.title}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/timegrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));

describe('Calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders FullCalendar component', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });
    render(<Calendar isAdmin={false} />);
    expect(screen.getByTestId('full-calendar')).toBeInTheDocument();
  });

  it('shows reservation details when an event is clicked', async () => {
    const mockReservations = [
      {
        id: 'res1',
        data: () => ({
          name: 'Project Shoot',
          startDate: { toDate: () => new Date('2026-03-20T10:00:00') },
          endDate: { toDate: () => new Date('2026-03-20T12:00:00') },
          equipmentIDs: [{ id: 'cam1', name: 'Camera' }],
          checkedOutItems: [],
          checkedInItems: [],
          team: 'Team Alpha',
          userEmail: 'user@ufl.edu'
        })
      }
    ];

    vi.mocked(getDocs).mockResolvedValue({ docs: mockReservations });

    render(<Calendar isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByText('Project Shoot')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Project Shoot'));

    expect(screen.getByText(/Team:/)).toBeInTheDocument();
    expect(screen.getByText(/Team Alpha/)).toBeInTheDocument();
    expect(screen.getByText('Camera')).toBeInTheDocument();
    expect(screen.getByText(/Reserved by:/)).toBeInTheDocument();
    expect(screen.getByText(/user@ufl.edu/)).toBeInTheDocument();
  });
});
