import { DatabaseApiClientError } from './database'

/** Turns an API or network failure into a sentence a person can act on. */
export const errorText = (error: unknown) => error instanceof DatabaseApiClientError ? ({
  400: 'Check the required fields, dates and review reason.',
  401: 'Your session expired. Sign in again.',
  403: 'Your account does not have permission for this action.',
  404: 'This record is unavailable.',
  409: 'This record changed or the action conflicts with its status. Reload before trying again.',
  429: 'Too many requests. Please wait a moment before trying again.',
  502: 'Production gateway received an invalid response. Please try again.',
  503: 'Production services are unavailable. Your unsaved work is still here.',
  504: 'The database request timed out while connecting. Please try again.'
}[error.status] ?? 'The request failed. Try again.') : error instanceof TypeError && /fetch|network/i.test(error.message) ? 'Network connection error. Check your connection.' : error instanceof Error ? error.message : 'Something went wrong. Try again.'
