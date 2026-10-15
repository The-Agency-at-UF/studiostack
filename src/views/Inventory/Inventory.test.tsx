import { mockDocument } from '../../test-utils/fixtures'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import Inventory from './Inventory';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, getDoc, setDoc } from '../../data/localStore';
import type { AddInventoryItem } from '../../components/AddItemPopup';

const popup = vi.hoisted(() => ({ addItem: undefined as AddInventoryItem | undefined }));

// Mock specific behavior for this test file
vi.mocked(onSnapshot<"inventory">).mockImplementation((q, callback) => {
  callback({
    docs: [
      mockDocument("inventory", '1', { name: 'Camera', category: 'Camera & Accessories', availability: 'available' }),
      mockDocument("inventory", '2', { name: 'Mic', category: 'Audio', availability: 'reported' }),
    ]
  });
  return () => {};
});

// Mock components that might cause issues in tests
vi.mock('../../components/AddItemPopup', () => ({
  default: ({ addItem }: { addItem: AddInventoryItem }) => { popup.addItem = addItem; return <div data-testid="add-item-popup">Add Item</div> }
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

  it('renders inventory items from the local data source', async () => {
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

  it('does not overwrite equipment when a scanned ID already exists', async () => {
    vi.mocked(getDoc<'inventory'>).mockResolvedValueOnce({ id: 'UF-001', exists: () => true, data: () => ({ name: 'Existing camera', category: 'Camera & Accessories', availability: 'available' }) });
    render(<Inventory isAdmin />);
    await act(async () => {
      await expect(popup.addItem!('New camera', 'Camera & Accessories', 'available', { equipmentId: 'UF-001' })).rejects.toThrow('already exists');
    });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('uses the scanned ID and keeps a photo key with the inventory record', async () => {
    vi.mocked(getDoc<'inventory'>).mockResolvedValueOnce({ id: 'UF-NEW-001', exists: () => false, data: () => undefined });
    render(<Inventory isAdmin />);
    await act(async () => { await popup.addItem!('New camera', 'Camera & Accessories', 'available', { equipmentId: 'UF-NEW-001', photoKey: 'photos/subject/camera.jpg' }); });
    expect(setDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'UF-NEW-001' }), expect.objectContaining({ name: 'New camera', photoKey: 'photos/subject/camera.jpg' }));
  });
});
