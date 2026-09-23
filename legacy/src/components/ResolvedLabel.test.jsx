import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ResolvedLabel from './ResolvedLabel';

describe('ResolvedLabel', () => {
  it('renders correctly with props', () => {
    const props = {
      resolvedBy: 'John Doe',
      resolvedOn: '2023-10-27'
    };
    
    render(<ResolvedLabel {...props} />);
    
    expect(screen.getByText(/This issue was resolved by John Doe on 2023-10-27/i)).toBeInTheDocument();
  });

  it('has the correct background color', () => {
    const props = {
      resolvedBy: 'Jane Doe',
      resolvedOn: '2023-10-28'
    };
    
    const { container } = render(<ResolvedLabel {...props} />);
    const div = container.firstChild;
    
    expect(div).toHaveStyle('background-color: #D1E0EF'); // #D1E0EF
  });
});
