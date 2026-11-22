import { describe, expect, it } from 'vitest'
import { DatabaseApiClientError } from './database'
import { errorText, serverMessage } from './errorText'

describe('API failure messages', () => {
  it('shows the server’s validation message for a 400 instead of a generic sentence', () => {
    const error = new DatabaseApiClientError(400, 'Bad Request', { error: 'Select 1 to 50 equipment items' })
    expect(serverMessage(error)).toBe('Select 1 to 50 equipment items.')
    expect(errorText(error)).toBe('Select 1 to 50 equipment items.')
  })
  it('passes through a 409 conflict explanation and keeps punctuation', () => {
    expect(errorText(new DatabaseApiClientError(409, 'Conflict', { error: 'That equipment was just booked by someone else.' }))).toBe('That equipment was just booked by someone else.')
  })
  it('falls back to the status message when the payload is missing, long or not text', () => {
    expect(errorText(new DatabaseApiClientError(400, 'Bad Request'))).toMatch(/Check the highlighted fields/)
    expect(errorText(new DatabaseApiClientError(400, 'Bad Request', { error: 'x'.repeat(300) }))).toMatch(/Check the highlighted fields/)
    expect(errorText(new DatabaseApiClientError(400, 'Bad Request', { error: { code: 1 } }))).toMatch(/Check the highlighted fields/)
  })
  it('never passes through server text for other statuses', () => {
    expect(errorText(new DatabaseApiClientError(500, 'Server Error', { error: 'pg: relation does not exist' }))).toBe('Something went wrong. Try again.')
  })
  it('says a failed load never lost changes', () => {
    expect(errorText(new DatabaseApiClientError(503), 'load')).toBe('StudioStack is temporarily unavailable. Try again in a moment.')
    expect(errorText(new DatabaseApiClientError(503))).toMatch(/Your unsaved work is still here/)
    expect(errorText(new DatabaseApiClientError(429))).toBe('Too many requests. Wait a minute, then try again.')
  })
})
