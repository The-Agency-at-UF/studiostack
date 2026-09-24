import '@testing-library/jest-dom';
import { vi } from 'vitest';

const localStorageValues = new Map();
const localStorageMock = {
  clear: () => localStorageValues.clear(),
  getItem: (key) => localStorageValues.get(key) ?? null,
  key: (index) => [...localStorageValues.keys()][index] ?? null,
  removeItem: (key) => localStorageValues.delete(key),
  setItem: (key, value) => localStorageValues.set(key, String(value)),
  get length() {
    return localStorageValues.size;
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
});

// Mock the local data adapter globally to keep component tests deterministic.
vi.mock('./data/localStore', () => ({
  db: {},
  collection: vi.fn((db, path) => ({ _path: { segments: [path] } })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((db, path, id) => ({ _path: { segments: [path, id].filter(Boolean) }, id })),
  serverTimestamp: vi.fn(() => ({ toDate: () => new Date() })),
  arrayUnion: vi.fn((...values) => values),
  where: vi.fn(),
}));
