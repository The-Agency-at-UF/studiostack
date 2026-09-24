const records = new Map();
const listeners = new Map();

export const db = Object.freeze({ kind: 'local-store' });

class LocalTimestamp {
  constructor(value = new Date()) {
    this.value = value instanceof Date ? value : new Date(value);
    this.seconds = Math.floor(this.value.getTime() / 1000);
  }

  toDate() {
    return new Date(this.value);
  }
}

const collectionRecords = (path) => {
  if (!records.has(path)) records.set(path, new Map());
  return records.get(path);
};

const normalizeValue = (value) => {
  if (value instanceof Date) return new LocalTimestamp(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object' && !value.toDate && !value.__operation) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeValue(nestedValue)]),
    );
  }
  return value;
};

const applyFields = (current, next) => {
  const updated = { ...current };

  Object.entries(next).forEach(([key, value]) => {
    if (value?.__operation === 'array-union') {
      const existing = Array.isArray(updated[key]) ? updated[key] : [];
      updated[key] = [...existing, ...value.values.map(normalizeValue)];
      return;
    }
    updated[key] = normalizeValue(value);
  });

  return updated;
};

const snapshotDocument = (path, id, data) => ({
  id,
  ref: doc(db, path, id),
  data: () => data,
});

const getFilteredEntries = (reference) => {
  let entries = [...collectionRecords(reference.path).entries()];

  for (const constraint of reference.constraints ?? []) {
    if (constraint.type === 'where' && constraint.operator === '==') {
      entries = entries.filter(([, data]) => data[constraint.field] === constraint.value);
    }
    if (constraint.type === 'order-by') {
      const direction = constraint.direction === 'desc' ? -1 : 1;
      entries.sort(([, left], [, right]) => {
        const leftValue = left[constraint.field]?.toDate?.() ?? left[constraint.field];
        const rightValue = right[constraint.field]?.toDate?.() ?? right[constraint.field];
        return leftValue === rightValue ? 0 : leftValue > rightValue ? direction : -direction;
      });
    }
  }

  return entries;
};

const notify = (path) => {
  const snapshot = {
    docs: getFilteredEntries(collection(db, path)).map(([id, data]) =>
      snapshotDocument(path, id, data),
    ),
  };
  listeners.get(path)?.forEach((listener) => listener(snapshot));
};

export const collection = (_database, path) => ({
  kind: 'collection',
  path,
  constraints: [],
});

export const doc = (databaseOrCollection, pathOrId, optionalId) => {
  if (databaseOrCollection?.kind === 'collection') {
    return { kind: 'document', path: databaseOrCollection.path, id: pathOrId };
  }
  return { kind: 'document', path: pathOrId, id: optionalId };
};

export const query = (reference, ...constraints) => ({
  ...reference,
  constraints,
});

export const orderBy = (field, direction = 'asc') => ({
  type: 'order-by',
  field,
  direction,
});

export const where = (field, operator, value) => ({
  type: 'where',
  field,
  operator,
  value,
});

export const getDocs = async (reference) => ({
  docs: getFilteredEntries(reference).map(([id, data]) =>
    snapshotDocument(reference.path, id, data),
  ),
});

export const getDoc = async (reference) => {
  const value = collectionRecords(reference.path).get(reference.id);
  return {
    id: reference.id,
    exists: () => value !== undefined,
    data: () => value,
  };
};

export const onSnapshot = (reference, listener) => {
  if (!listeners.has(reference.path)) listeners.set(reference.path, new Set());
  listeners.get(reference.path).add(listener);
  listener({
    docs: getFilteredEntries(reference).map(([id, data]) =>
      snapshotDocument(reference.path, id, data),
    ),
  });

  return () => listeners.get(reference.path)?.delete(listener);
};

export const addDoc = async (reference, data) => {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  collectionRecords(reference.path).set(id, applyFields({}, data));
  notify(reference.path);
  return doc(db, reference.path, id);
};

export const setDoc = async (reference, data, options = {}) => {
  const collectionData = collectionRecords(reference.path);
  const current = options.merge ? collectionData.get(reference.id) ?? {} : {};
  collectionData.set(reference.id, applyFields(current, data));
  notify(reference.path);
};

export const updateDoc = async (reference, data) => setDoc(reference, data, { merge: true });

export const deleteDoc = async (reference) => {
  collectionRecords(reference.path).delete(reference.id);
  notify(reference.path);
};

export const serverTimestamp = () => new LocalTimestamp();

export const arrayUnion = (...values) => ({
  __operation: 'array-union',
  values,
});
