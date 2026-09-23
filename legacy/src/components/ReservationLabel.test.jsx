import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ReservationLabel from './ReservationLabel';

// Mock useNavigate
const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('ReservationLabel', () => {
  const mockStartDate = new Date('2023-01-01T10:00:00');
  const mockEndDate = new Date('2023-01-01T12:00:00');

  const mockReservation = {
    reservationId: 'res123',
    name: 'Camera Kit 1',
    equipmentIDs: ['eq1', 'eq2'],
    startDate: { toDate: () => mockStartDate },
    endDate: { toDate: () => mockEndDate }
  };

  it('renders correctly with props', () => {
    render(
      <MemoryRouter>
        <ReservationLabel reservation={mockReservation} backgroundColor="#D1E0EF" />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Camera Kit 1')).toBeInTheDocument();
    expect(screen.getByText('Items Held: 2')).toBeInTheDocument();
    // Since formatting can vary by locale, we check for presence of some date parts
    // or we can test the formatDate function's output specifically if we mock the locale
  });

  it('navigates to check-in-out when clicking the arrow', () => {
    render(
      <MemoryRouter>
        <ReservationLabel reservation={mockReservation} backgroundColor="#D1E0EF" />
      </MemoryRouter>
    );
    
    // Find the icon by its color
    const arrow = document.querySelector('svg[color="#426276"]');
    
    if (arrow) {
        fireEvent.click(arrow);
        expect(mockedNavigate).toHaveBeenCalledWith('/check-in-out', { state: mockReservation.reservationId });
    } else {
        throw new Error('Could not find arrow icon');
    }
  });

  it('has the correct background color', () => {
    const { container } = render(
      <MemoryRouter>
        <ReservationLabel reservation={mockReservation} backgroundColor="#D1E0EF" />
      </MemoryRouter>
    );
    const div = container.firstChild;
    expect(div).toHaveStyle('background-color: #D1E0EF');
  });
});
