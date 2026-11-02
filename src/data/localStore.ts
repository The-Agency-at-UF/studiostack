import type { CollectionData, Timestamp } from '../types/models'

type CollectionName = keyof CollectionData
type StoredFields = Record<string, unknown>
type Database = typeof db
type Constraint =
  | { type: 'where'; field: string; operator: '=='; value: unknown }
  | { type: 'order-by'; field: string; direction: 'asc' | 'desc' }
export interface CollectionReference<K extends CollectionName = CollectionName> {
  kind: 'collection'
  path: K
  constraints: Constraint[]
}
export interface DocumentReference<K extends CollectionName = CollectionName> {
  kind: 'document'
  path: K
  id: string
}
export interface DocumentSnapshot<K extends CollectionName = CollectionName> {
  id: string
  ref: DocumentReference<K>
  data(): CollectionData[K]
}
export interface QuerySnapshot<K extends CollectionName = CollectionName> {
  docs: DocumentSnapshot<K>[]
}
type ArrayUnion<T> = { __operation: 'array-union'; values: T[] }
/** Dates supplied by forms are normalized into timestamps at the store boundary. */
type WriteValue<T> = T extends Timestamp ? Timestamp | Date
  : T extends (infer V)[] ? WriteValue<V>[] | ArrayUnion<WriteValue<V>>
  : T extends object ? { [P in keyof T]: WriteValue<T[P]> } : T
type WriteData<K extends CollectionName> = WriteValue<CollectionData[K]>

const records = new Map<CollectionName, Map<string, StoredFields>>()
const listeners = new Map<CollectionName, Set<() => void>>()
export const db = Object.freeze({ kind: 'local-store' as const })

export class LocalTimestamp implements Timestamp {
  private readonly value: Date
  readonly seconds: number
  constructor(value: Date | string | number = new Date()) {
    this.value = new Date(value)
    this.seconds = Math.floor(this.value.getTime() / 1000)
  }
  toDate() { return new Date(this.value) }
}

const collectionRecords = (path: CollectionName): Map<string, StoredFields> => {
  let values = records.get(path)
  if (!values) {
    values = new Map()
    records.set(path, values)
  }
  return values
}
const isObject = (value: unknown): value is StoredFields => value !== null && typeof value === 'object'
const normalizeValue = (value: unknown): unknown => {
  if (value instanceof Date) return new LocalTimestamp(value)
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (isObject(value) && !value.toDate && !value.__operation) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]))
  }
  return value
}
const applyFields = (current: StoredFields, next: object): StoredFields => {
  const updated = { ...current }
  Object.entries(next).forEach(([key, value]: [string, unknown]) => {
    if (isObject(value) && value.__operation === 'array-union' && Array.isArray(value.values)) {
      const existing = Array.isArray(updated[key]) ? updated[key] : []
      updated[key] = [...existing, ...value.values.map(normalizeValue)]
    } else {
      updated[key] = normalizeValue(value)
    }
  })
  return updated
}
const comparableValue = (value: unknown): string | number => {
  if (isObject(value) && typeof value.toDate === 'function') {
    const date: unknown = value.toDate()
    if (date instanceof Date) return date.getTime()
  }
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}
const getFilteredEntries = (reference: CollectionReference) => {
  let entries = [...collectionRecords(reference.path).entries()]
  for (const constraint of reference.constraints) {
    if (constraint.type === 'where') {
      entries = entries.filter(([, data]) => data[constraint.field] === constraint.value)
    } else {
      const direction = constraint.direction === 'desc' ? -1 : 1
      entries.sort(([, left], [, right]) => {
        const leftValue = comparableValue(left[constraint.field])
        const rightValue = comparableValue(right[constraint.field])
        return leftValue === rightValue ? 0 : leftValue > rightValue ? direction : -direction
      })
    }
  }
  return entries
}
const snapshotDocument = <K extends CollectionName>(path: K, id: string, data: StoredFields): DocumentSnapshot<K> => ({
  id,
  ref: doc(db, path, id),
  // Only typed writes enter this adapter; normalization preserves the collection's shape.
  data: () => data as unknown as CollectionData[K],
})
const snapshot = <K extends CollectionName>(reference: CollectionReference<K>): QuerySnapshot<K> => ({
  docs: getFilteredEntries(reference).map(([id, data]) => snapshotDocument(reference.path, id, data)),
})
const notify = (path: CollectionName) => listeners.get(path)?.forEach((listener) => listener())

export const collection = <K extends CollectionName>(_database: Database, path: K): CollectionReference<K> => ({ kind: 'collection', path, constraints: [] })
export function doc<K extends CollectionName>(reference: CollectionReference<K>, id: string): DocumentReference<K>
export function doc<K extends CollectionName>(database: Database, path: K, id: string): DocumentReference<K>
export function doc<K extends CollectionName>(databaseOrCollection: Database | CollectionReference<K>, pathOrId: K | string, optionalId?: string): DocumentReference<K> {
  if (databaseOrCollection.kind === 'collection') {
    return { kind: 'document', path: databaseOrCollection.path, id: pathOrId }
  }
  if (!optionalId) throw new Error('A document ID is required')
  return { kind: 'document', path: pathOrId as K, id: optionalId }
}
export const query = <K extends CollectionName>(reference: CollectionReference<K>, ...constraints: Constraint[]): CollectionReference<K> => ({ ...reference, constraints })
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): Constraint => ({ type: 'order-by', field, direction })
export const where = (field: string, operator: '==', value: unknown): Constraint => ({ type: 'where', field, operator, value })
export const getDocs = async <K extends CollectionName>(reference: CollectionReference<K>): Promise<QuerySnapshot<K>> => snapshot(reference)
export const getDoc = async <K extends CollectionName>(reference: DocumentReference<K>) => {
  const value = collectionRecords(reference.path).get(reference.id)
  return {
    id: reference.id,
    exists: () => value !== undefined,
    data: (): CollectionData[K] | undefined => value as CollectionData[K] | undefined,
  }
}
export const onSnapshot = <K extends CollectionName>(reference: CollectionReference<K>, listener: (value: QuerySnapshot<K>) => void) => {
  const emit = () => listener(snapshot(reference))
  let subscribers = listeners.get(reference.path)
  if (!subscribers) {
    subscribers = new Set()
    listeners.set(reference.path, subscribers)
  }
  subscribers.add(emit)
  emit()
  return () => { subscribers.delete(emit) }
}
export const addDoc = async <K extends CollectionName>(reference: CollectionReference<K>, data: WriteData<K>) => {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  collectionRecords(reference.path).set(id, applyFields({}, data))
  notify(reference.path)
  return doc(db, reference.path, id)
}
export function setDoc<K extends CollectionName>(reference: DocumentReference<K>, data: WriteData<K>, options?: { merge?: false }): Promise<void>
export function setDoc<K extends CollectionName>(reference: DocumentReference<K>, data: Partial<WriteData<K>>, options: { merge: true }): Promise<void>
export async function setDoc<K extends CollectionName>(reference: DocumentReference<K>, data: Partial<WriteData<K>>, options: { merge?: boolean } = {}) {
  const values = collectionRecords(reference.path)
  const current = options.merge ? values.get(reference.id) ?? {} : {}
  values.set(reference.id, applyFields(current, data))
  notify(reference.path)
}
export const updateDoc = async <K extends CollectionName>(reference: DocumentReference<K>, data: Partial<WriteData<K>>) => setDoc(reference, data, { merge: true })
export const deleteDoc = async (reference: DocumentReference) => {
  collectionRecords(reference.path).delete(reference.id)
  notify(reference.path)
}
export const serverTimestamp = () => new LocalTimestamp()
export const arrayUnion = <T,>(...values: T[]): ArrayUnion<T> => ({ __operation: 'array-union', values })
