import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ReportLabel from './ReportLabel';

// Mock useNavigate
const mockedNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('ReportLabel', () => {
  const mockReport = {
    reportID: '123',
    item: 'Camera',
    user: 'John Doe'
  };

  it('renders correctly with props', () => {
    render(
      <MemoryRouter>
        <ReportLabel report={mockReport} backgroundColor="#f0f0f0" />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Item: Camera')).toBeInTheDocument();
    expect(screen.getByText('Reported By: John Doe')).toBeInTheDocument();
  });

  it('navigates to report-summary when clicking the arrow', () => {
    render(
      <MemoryRouter>
        <ReportLabel report={mockReport} backgroundColor="#f0f0f0" />
      </MemoryRouter>
    );
    
    // Find the icon by its color which is unique in this component
    const arrow = document.querySelector('svg[color="#426276"]');
    
    if (arrow) {
        fireEvent.click(arrow);
        expect(mockedNavigate).toHaveBeenCalledWith('/report-summary', { state: mockReport.reportID });
    } else {
        throw new Error('Could not find arrow icon');
    }
  });

  it('has the correct background color', () => {
    const { container } = render(
      <MemoryRouter>
        <ReportLabel report={mockReport} backgroundColor="#f0f0f0" />
      </MemoryRouter>
    );
    const div = container.firstChild;
    expect(div).toHaveStyle('background-color: #f0f0f0');
  });
});
