import { describe, expect, it } from 'vitest'
import { bytesLabel, dateLabel, localToday, statusLabel } from './index'
import { dateErrors, emptyBrief, cleanText } from '../types/production'

describe('shared formatting', () => {
  it('uses the reader’s local calendar day, not the UTC day', () => {
    // 9 PM in Gainesville on Nov 21 is already Nov 22 in UTC.
    const evening = new Date(2026, 10, 21, 21, 0, 0)
    expect(localToday(evening)).toBe('2026-11-21')
  })
  it('keeps date-only values on their calendar day', () => {
    expect(dateLabel('2026-11-21')).toMatch(/Nov 21, 2026/)
    expect(dateLabel(null)).toBe('Not scheduled')
  })
  it('labels sizes and stored statuses for people', () => {
    expect(bytesLabel(20480)).toMatch(/21\s?kB|21\s?KB/i)
    expect(statusLabel('uncertain')).toBe('May have sent')
    expect(statusLabel('changes_requested')).toBe('Changes requested')
    expect(statusLabel('something_new')).toBe('Something new')
  })
})

describe('brief checks', () => {
  it('never calls today’s delivery date past', () => {
    const brief = { ...emptyBrief(), deliveryDate: localToday() }
    expect(dateErrors(brief).find(e => e.key === 'deliveryDate')).toBeUndefined()
  })
  it('flags insecure links before the server refuses them', () => {
    const brief = { ...emptyBrief(), fields: { ...emptyBrief().fields, brandLink: 'http://example.com/brand' } }
    expect(dateErrors(brief, true)).toContainEqual({ key: 'brandLink', message: 'Brand guidelines link must start with https://.' })
  })
  it('strips control characters the server rejects but keeps line breaks', () => {
    expect(cleanText('Line one\fstill\vhere\nnext\tcol')).toBe('Line onestillhere\nnext\tcol')
  })
})
