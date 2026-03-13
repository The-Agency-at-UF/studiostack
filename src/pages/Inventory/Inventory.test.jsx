import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Inventory from './Inventory';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';

// Mock specific behavior for this test file
vi.mocked(onSnapshot).mockImplementation((q, callback) => {
  callback({
    docs: [
      { id: '1', data: () => ({ name: 'Camera', category: 'Camera & Accessories', availability: 'available' }) },
      { id: '2', data: () => ({ name: 'Mic', category: 'Audio', availability: 'reported' }) },
    ]
  });
  return () => {};
});

// Mock components that might cause issues in tests
vi.mock('../../components/AddItemPopup', () => ({
  default: () => <div data-testid="add-item-popup">Add Item</div>
}));
vi.mock('../../components/RemoveItemPopup', () => ({
  default: () => <div data-testid="remove-item-popup">Remove Item</div>
}));
vi.mock('../../components/QRCodeGenerator', () => ({
  default: () => <div data-testid="qr-code">QR</div>
}));

describe('Inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inventory items from firebase', async () => {
    render(<Inventory isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByText('Camera')).toBeInTheDocument();
      expect(screen.getByText('Mic')).toBeInTheDocument();
    });
  });

  it('filters items when search term is entered', async () => {
    render(<Inventory isAdmin={false} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter item name...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Enter item name...');
    fireEvent.change(searchInput, { target: { value: 'Camera' } });
    
    await waitFor(() => {
      expect(screen.getByText('Camera')).toBeInTheDocument();
      expect(screen.queryByText('Mic')).not.toBeInTheDocument();
    });
  });

  it('shows admin popups only for admin users', async () => {
    const { rerender } = render(<Inventory isAdmin={false} />);
    await waitFor(() => {
      expect(screen.queryByTestId('add-item-popup')).not.toBeInTheDocument();
    });

    rerender(<Inventory isAdmin={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('add-item-popup')).toBeInTheDocument();
      expect(screen.getByTestId('remove-item-popup')).toBeInTheDocument();
    });
  });
});
