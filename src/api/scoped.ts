/** Sends a request relative to one organization-scoped API prefix. */
export type Send = <T>(path: string, method?: string, body?: unknown) => Promise<T>
/** Query string for the next page of up to 100 records after a keyset cursor. */
export const pageQuery = (after?: string) => '?' + new URLSearchParams({ limit: '100', ...(after ? { after } : {}) })
