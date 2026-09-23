import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LogIn from './LogIn';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signInWithPopup } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';

describe('LogIn', () => {
  const setEmail = vi.fn();
  const setIsAdmin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders sign in button and logo', () => {
    render(<LogIn setEmail={setEmail} setIsAdmin={setIsAdmin} />);
    expect(screen.getByAltText('StudioStack by The Agency')).toBeInTheDocument();
    expect(screen.getByAltText('Sign In with Google')).toBeInTheDocument();
  });

  it('calls setEmail and setIsAdmin on successful login', async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { email: 'test@ufl.edu' }
    });
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ isAdmin: true })
    });

    render(<LogIn setEmail={setEmail} setIsAdmin={setIsAdmin} />);
    
    const signInButton = screen.getByAltText('Sign In with Google');
    fireEvent.click(signInButton);

    await waitFor(() => {
      expect(setEmail).toHaveBeenCalledWith('test@ufl.edu');
      expect(setIsAdmin).toHaveBeenCalledWith(true);
      expect(localStorage.getItem('email')).toBe('test@ufl.edu');
      expect(localStorage.getItem('isAdmin')).toBe('true');
    });
  });

  it('shows error message when user is not in database', async () => {
    vi.mocked(signInWithPopup).mockResolvedValue({
      user: { email: 'unknown@ufl.edu' }
    });
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false
    });

    render(<LogIn setEmail={setEmail} setIsAdmin={setIsAdmin} />);
    
    const signInButton = screen.getByAltText('Sign In with Google');
    fireEvent.click(signInButton);

    await waitFor(() => {
      expect(screen.getByText(/Unable to authorize your email/)).toBeInTheDocument();
    });
  });
});
