import { describe, expect, it } from 'vitest'
import { DatabaseApiClientError } from '../../api/database'
import { equipmentError } from './live'

describe('equipment failure messages', () => {
  it('shows the server’s validation message for a 400', () => {
    expect(equipmentError(new DatabaseApiClientError(400, 'Bad Request', { error: 'Select 1 to 50 equipment items' }))).toBe('Select 1 to 50 equipment items.')
  })
  it('says a failed load never lost changes', () => {
    expect(equipmentError(new DatabaseApiClientError(503), 'load')).toBe('StudioStack is temporarily unavailable. Try again in a moment.')
    expect(equipmentError(new DatabaseApiClientError(503))).toMatch(/whether your change was saved/)
  })
})
