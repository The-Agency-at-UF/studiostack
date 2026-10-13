import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ReportLabel from './ReportLabel';

// Mock the Next.js router
const mockedNavigate = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockedNavigate }),
}));

describe('ReportLabel', () => {
  const mockReport = {
    reportID: '123',
    item: 'Camera',
    user: 'John Doe'
  };

  it('renders correctly with props', () => {
    render(<ReportLabel report={mockReport} backgroundColor="#f0f0f0" />);

    expect(screen.getByText('Item: Camera')).toBeInTheDocument();
    expect(screen.getByText('Reported By: John Doe')).toBeInTheDocument();
  });

  it('navigates to report-summary when clicking the arrow', () => {
    render(<ReportLabel report={mockReport} backgroundColor="#f0f0f0" />);

    // Find the icon by its color which is unique in this component
    const arrow = document.querySelector('svg[color="#426276"]');

    if (arrow) {
        fireEvent.click(arrow);
        expect(mockedNavigate).toHaveBeenCalledWith('/report-summary?reportId=123');
    } else {
        throw new Error('Could not find arrow icon');
    }
  });

  it('has the correct background color', () => {
    const { container } = render(<ReportLabel report={mockReport} backgroundColor="#f0f0f0" />);
    const div = container.firstChild;
    expect(div).toHaveStyle('background-color: #f0f0f0');
  });
});
