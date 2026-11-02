import { createHash } from 'node:crypto'
import type { ApiPage } from '../../src/types/database-api'

/** Builds a keyset page from rows fetched with LIMIT size + 1. */
export function pageOf<T extends { id: string }>(rows: T[], size: number): ApiPage<T> {
  const items = rows.slice(0, size)
  return { items, nextCursor: rows.length > size ? items[items.length - 1].id : null }
}
export const isAdmin = (role: string) => role === 'owner' || role === 'admin'
/** Fingerprint of an idempotent request body, compared when a request ID is reused. */
export const requestHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
