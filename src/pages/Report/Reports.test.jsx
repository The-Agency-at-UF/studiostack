import { render, screen, waitFor } from '@testing-library/react';
import Reports from './Reports';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocs } from 'firebase/firestore';
import { MemoryRouter } from 'react-router-dom';

// Mock components
vi.mock('../../components/ReportLabel', () => ({
  default: ({ report }) => <div data-testid="report-label">{report.reportID}</div>
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('email', 'test@ufl.edu');
  });

  it('renders "no active reports" when empty', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });

    render(
      <MemoryRouter>
        <Reports isAdmin={false} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('You have no active reports!')).toBeInTheDocument();
    });
  });

  it('renders active and resolved reports for admin', async () => {
    const mockDocs = [
      {
        id: 'report-active',
        data: () => ({
          user: 'other@ufl.edu',
          resolved: false,
        })
      },
      {
        id: 'report-resolved',
        data: () => ({
          user: 'test@ufl.edu',
          resolved: true,
        })
      }
    ];

    vi.mocked(getDocs).mockResolvedValue({ docs: mockDocs });

    render(
      <MemoryRouter>
        <Reports isAdmin={true} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('report-active')).toBeInTheDocument();
      expect(screen.getByText('report-resolved')).toBeInTheDocument();
    });
  });

  it('only shows user reports for non-admin', async () => {
    const mockDocs = [
      {
        id: 'report-other',
        data: () => ({
          user: 'other@ufl.edu',
          resolved: false,
        })
      },
      {
        id: 'report-mine',
        data: () => ({
          user: 'test@ufl.edu',
          resolved: false,
        })
      }
    ];

    vi.mocked(getDocs).mockResolvedValue({ docs: mockDocs });

    render(
      <MemoryRouter>
        <Reports isAdmin={false} />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('report-mine')).toBeInTheDocument();
      expect(screen.queryByText('report-other')).not.toBeInTheDocument();
    });
  });
});
