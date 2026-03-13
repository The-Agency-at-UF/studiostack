import { render, screen, waitFor } from '@testing-library/react';
import Statistics from './Statistics';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDocs } from 'firebase/firestore';

// Mock Recharts to avoid issues in JSDOM
vi.mock('recharts', () => ({
  PieChart: ({ children }) => <svg data-testid="pie-chart">{children}</svg>,
  Pie: ({ children }) => <g data-testid="pie">{children}</g>,
  Cell: () => <rect />,
  Label: () => <text />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
}));

// Mock BarGraph component
vi.mock('../../components/BarGraph', () => ({
  default: ({ title }) => <div data-testid="bar-graph">{title}</div>
}));

describe('Statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders statistics page with charts', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });

    render(<Statistics />);

    await waitFor(() => {
      expect(screen.getByText('Statistics')).toBeInTheDocument();
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    });
  });

  it('displays "No Overdue Equipment!" when there are no overdue items', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });

    render(<Statistics />);

    await waitFor(() => {
      expect(screen.getByText('No Overdue Equipment!')).toBeInTheDocument();
    });
  });

  it('renders bar graphs for various data sections', async () => {
    vi.mocked(getDocs).mockResolvedValue({ docs: [] });

    render(<Statistics />);

    await waitFor(() => {
      expect(screen.getByText('Top Reported Items')).toBeInTheDocument();
      expect(screen.getByText('Top Reporting Users')).toBeInTheDocument();
      expect(screen.getByText('Top Reserved Items')).toBeInTheDocument();
      expect(screen.getByText('Top Reserving Users')).toBeInTheDocument();
      expect(screen.getByText('Top Teams')).toBeInTheDocument();
    });
  });
});
