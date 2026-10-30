/**
 * Recently loaded workspace snapshots can render while a page checks for
 * server updates. This cache never establishes identity or authorizes writes.
 */
type CacheEntry<T> = {
  data: T
  timestamp: number
}

const memoryCache = new Map<string, CacheEntry<unknown>>()

export function getCached<T>(key: string, maxAgeMs = 120_000): T | null {
  const mem = memoryCache.get(key)
  if (mem && Date.now() - mem.timestamp < maxAgeMs) {
    return mem.data as T
  }
  if (typeof window !== 'undefined') {
    try {
      const serialized = sessionStorage.getItem(`studiostack.swr.${key}`)
      if (serialized) {
        const parsed = JSON.parse(serialized) as CacheEntry<T>
        if (Date.now() - parsed.timestamp < maxAgeMs) {
          memoryCache.set(key, parsed as CacheEntry<unknown>)
          return parsed.data
        }
      }
    } catch { /* Use memory when browser storage is unavailable. */ }
  }
  return null
}

export function setCached<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, timestamp: Date.now() }
  memoryCache.set(key, entry as CacheEntry<unknown>)
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(`studiostack.swr.${key}`, JSON.stringify(entry))
    } catch { /* The in-memory snapshot remains usable. */ }
  }
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear()
    if (typeof window !== 'undefined') {
      try {
        const keys = Object.keys(sessionStorage).filter(k => k.startsWith('studiostack.swr.'))
        keys.forEach(k => sessionStorage.removeItem(k))
      } catch { /* Storage may be blocked by the browser. */ }
    }
    return
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(prefix)) memoryCache.delete(k)
  }
  if (typeof window !== 'undefined') {
    try {
      const keys = Object.keys(sessionStorage).filter(k => k.startsWith(`studiostack.swr.${prefix}`))
      keys.forEach(k => sessionStorage.removeItem(k))
    } catch { /* Storage may be blocked by the browser. */ }
  }
}
