import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LogIn from './LogIn';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('LogIn', () => {
  const setEmail = vi.fn();
  const setIsAdmin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders the local access button and logo', () => {
    render(<LogIn setEmail={setEmail} setIsAdmin={setIsAdmin} />);
    expect(screen.getByAltText('StudioStack by The Agency')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to StudioStack' })).toBeInTheDocument();
  });

  it('creates a local demo session', async () => {
    render(<LogIn setEmail={setEmail} setIsAdmin={setIsAdmin} />);

    const signInButton = screen.getByRole('button', { name: 'Continue to StudioStack' });
    fireEvent.click(signInButton);

    await waitFor(() => {
      expect(setEmail).toHaveBeenCalledWith('demo@studiostack.com');
      expect(setIsAdmin).toHaveBeenCalledWith(true);
      expect(localStorage.getItem('email')).toBe('demo@studiostack.com');
      expect(localStorage.getItem('isAdmin')).toBe('true');
    });
  });
});
