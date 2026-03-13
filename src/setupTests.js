import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase App and Analytics
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/analytics', () => ({
  getAnalytics: vi.fn(() => ({})),
  isSupported: vi.fn().mockResolvedValue(false),
}));

// Mock Firestore globally to avoid initialization issues
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn((db, path) => ({ _path: { segments: [path] } })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((db, path, id) => ({ _path: { segments: [path, id].filter(Boolean) }, id })),
  serverTimestamp: vi.fn(),
}));

// Mock Auth
vi.mock('firebase/auth', () => {
  const mockProvider = vi.fn();
  mockProvider.prototype.setCustomParameters = vi.fn();
  
  return {
    getAuth: vi.fn(),
    signInWithPopup: vi.fn(),
    GoogleAuthProvider: mockProvider,
    setPersistence: vi.fn(),
    browserSessionPersistence: 'browserSessionPersistence',
  };
});
