import { DatabaseApiClientError } from './database'

/**
 * The server's own explanation for a refused request, such as "Select 1 to 50 equipment items".
 * Only validation (400) and conflict (409) answers carry one written for people; anything long or
 * missing falls back to the status message instead.
 */
export function serverMessage(error: unknown): string | null {
  if (!(error instanceof DatabaseApiClientError) || ![400, 409].includes(error.status)) return null
  const sent = (error.payload as { error?: unknown } | undefined)?.error
  if (typeof sent !== 'string') return null
  const text = sent.trim()
  if (!text || text.length > 200) return null
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** Reads fail differently from saves: a failed load never suggests that changes may have been lost. */
export type FailureKind = 'load' | 'save'

/** Turns an API or network failure into a sentence a person can act on: what happened and what to do next. */
export const errorText = (error: unknown, kind: FailureKind = 'save') => {
  const sent = serverMessage(error)
  if (sent) return sent
  if (error instanceof DatabaseApiClientError) return ({
    400: 'Some details weren’t accepted. Check the highlighted fields and try again.',
    401: 'Your session expired. Sign in again to continue.',
    403: 'Your account doesn’t have permission for this. Ask an organization admin for access.',
    404: 'This record no longer exists. It may have been deleted.',
    409: 'This record changed since you opened it. Reload, then try again.',
    429: 'Too many requests. Wait a minute, then try again.',
    502: 'StudioStack didn’t respond in time. Try again.',
    503: kind === 'load' ? 'StudioStack is temporarily unavailable. Try again in a moment.' : 'StudioStack is temporarily unavailable. Your unsaved work is still here; try again in a moment.',
    504: 'StudioStack didn’t respond in time. Try again.'
  } as Record<number, string>)[error.status] ?? 'Something went wrong. Try again.'
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return 'You appear to be offline. Check your connection, then try again.'
  // Local errors (the preview workspace, upload checks) are written for people already.
  return error instanceof Error && error.message ? error.message : 'Something went wrong. Try again.'
}
