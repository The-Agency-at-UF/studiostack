import type { CollectionData, Timestamp } from '../types/models'

type CollectionName = keyof CollectionData
type StoredFields = Record<string, unknown>
type Database = typeof db
export interface CollectionReference<K extends CollectionName = CollectionName> {
  kind: 'collection'
  path: K
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
/** Dates supplied by forms are normalized into timestamps at the store boundary. */
type WriteValue<T> = T extends Timestamp ? Timestamp | Date
  : T extends (infer V)[] ? WriteValue<V>[]
  : T extends object ? { [P in keyof T]: WriteValue<T[P]> } : T
type WriteData<K extends CollectionName> = WriteValue<CollectionData[K]>

const records = new Map<CollectionName, Map<string, StoredFields>>()
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
  if (isObject(value) && !value.toDate) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]))
  }
  return value
}
const applyFields = (current: StoredFields, next: object): StoredFields => ({
  ...current,
  ...Object.fromEntries(Object.entries(next).map(([key, value]: [string, unknown]) => [key, normalizeValue(value)])),
})
const snapshotDocument = <K extends CollectionName>(path: K, id: string, data: StoredFields): DocumentSnapshot<K> => ({
  id,
  ref: doc(db, path, id),
  // Only typed writes enter this adapter; normalization preserves the collection's shape.
  data: () => data as unknown as CollectionData[K],
})
const snapshot = <K extends CollectionName>(reference: CollectionReference<K>): QuerySnapshot<K> => ({
  docs: [...collectionRecords(reference.path).entries()].map(([id, data]) => snapshotDocument(reference.path, id, data)),
})

export const collection = <K extends CollectionName>(_database: Database, path: K): CollectionReference<K> => ({ kind: 'collection', path })
export const doc = <K extends CollectionName>(_database: Database, path: K, id: string): DocumentReference<K> => ({ kind: 'document', path, id })
export const getDocs = async <K extends CollectionName>(reference: CollectionReference<K>): Promise<QuerySnapshot<K>> => snapshot(reference)
export const getDoc = async <K extends CollectionName>(reference: DocumentReference<K>) => {
  const value = collectionRecords(reference.path).get(reference.id)
  return {
    id: reference.id,
    exists: () => value !== undefined,
    data: (): CollectionData[K] | undefined => value as CollectionData[K] | undefined,
  }
}
export const addDoc = async <K extends CollectionName>(reference: CollectionReference<K>, data: WriteData<K>) => {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  collectionRecords(reference.path).set(id, applyFields({}, data))
  return doc(db, reference.path, id)
}
export function setDoc<K extends CollectionName>(reference: DocumentReference<K>, data: WriteData<K>, options?: { merge?: false }): Promise<void>
export function setDoc<K extends CollectionName>(reference: DocumentReference<K>, data: Partial<WriteData<K>>, options: { merge: true }): Promise<void>
export async function setDoc<K extends CollectionName>(reference: DocumentReference<K>, data: Partial<WriteData<K>>, options: { merge?: boolean } = {}) {
  const values = collectionRecords(reference.path)
  const current = options.merge ? values.get(reference.id) ?? {} : {}
  values.set(reference.id, applyFields(current, data))
}
export const updateDoc = async <K extends CollectionName>(reference: DocumentReference<K>, data: Partial<WriteData<K>>) => setDoc(reference, data, { merge: true })
export const deleteDoc = async (reference: DocumentReference) => {
  collectionRecords(reference.path).delete(reference.id)
}
export const serverTimestamp = () => new LocalTimestamp()
