import '@testing-library/jest-dom';
import { beforeEach, vi } from 'vitest';
import { invalidateCache } from './api/cache';

// Exercise the same cache path as production; isolate data between tests.
beforeEach(() => invalidateCache());

const localStorageValues = new Map<string, string>();
const localStorageMock: Storage = {
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
vi.mock('./data/localStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/localStore')>();
  return {
    ...actual,
    collection: vi.fn(actual.collection),
    getDocs: vi.fn<typeof actual.getDocs>().mockResolvedValue({ docs: [] }),
    getDoc: vi.fn(actual.getDoc),
    setDoc: vi.fn(actual.setDoc),
    addDoc: vi.fn(actual.addDoc),
    updateDoc: vi.fn(actual.updateDoc),
    deleteDoc: vi.fn(actual.deleteDoc),
    doc: vi.fn(actual.doc),
    serverTimestamp: vi.fn(actual.serverTimestamp),
  };
});

// The app shell mounts a ToastProvider; give every rendered view one too, nested inside any wrapper a test passes.
vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  const { createElement } = await import('react');
  const { ToastProvider } = await import('./components/workspace/Toast');
  type Wrapper = import('react').JSXElementConstructor<{ children: import('react').ReactNode }>;
  const withToasts = (Inner?: Wrapper): Wrapper => ({ children }) =>
    createElement(ToastProvider, null, Inner ? createElement(Inner, null, children) : children);
  return {
    ...actual,
    render: ((ui: Parameters<typeof actual.render>[0], options?: Parameters<typeof actual.render>[1]) =>
      actual.render(ui, { ...options, wrapper: withToasts(options?.wrapper as Wrapper | undefined) })) as typeof actual.render,
  };
});
