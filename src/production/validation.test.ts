// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { briefData, briefCommand, productionSettings } from '../../backend/production/validation'
import { emptyBrief, submissionErrors, visibleSections } from '../types/production'
const requestId = '11111111-1111-4111-8111-111111111111'
describe('production brief inputs and conditional requirements', () => {
  it('allows incomplete drafts but identifies required submission fields', () => {
    const draft = briefData(emptyBrief())
    expect(submissionErrors(draft)).toContain('Production type')
    expect(submissionErrors(draft)).toContain('Project name')
  })
  it('requires on-site logistics only for photography/video shoots', () => {
    const draft = { ...emptyBrief(), productionTypes: ['Video Editing' as const] }
    expect(visibleSections(draft).map(s=>s.title)).not.toContain('On-site production')
    expect(submissionErrors(draft)).toContain('Editing style / direction')
    expect(submissionErrors(draft)).not.toContain('Primary location')
    draft.productionTypes = ['Videography'] as unknown as typeof draft.productionTypes
    expect(submissionErrors(draft)).toContain('Primary location')
  })
  it.each([
    { fields: { notAField: 'injected' } }, { role: 'admin' }, { productionTypes: ['Photography','Photography'] }, { deliveryDate: '2026-02-30' },
    { fields: { proposedStart: '2026-11-05', proposedEnd: '2026-11-04' } }, { fields: { proposedStart: '2026-11-05' } },
    { fields: { brandLink: 'javascript:alert(1)' } }, { fields: { permits: 'Definitely' } },
  ])('rejects invalid or injected brief content %j', input => { expect(()=>briefData({ ...emptyBrief(), ...input })).toThrow() })
  it('allows a month-only estimate and safe reference URL in a draft', () => { expect(briefData({ ...emptyBrief(), fields: { shootEstimate: 'November', brandLink: 'https://example.org/brand' } }).fields.shootEstimate).toBe('November') })
  it.each(['request_changes','deny','comment'])('requires a reason for %s', action => { expect(()=>briefCommand({ action,version:1,requestId })).toThrow('reason') })
  it('rejects optimistic-version bypass and malformed schedules', () => {
    expect(()=>briefCommand({ action:'approve',version:-1,requestId })).toThrow()
    expect(()=>briefCommand({ action:'schedule',version:1,requestId,shootStartsAt:'2026-11-01',shootEndsAt:'2026-11-02' })).toThrow()
    expect(()=>briefCommand({ action:'schedule',version:1,requestId,shootStartsAt:'2026-11-02T12:00Z',shootEndsAt:'2026-11-01T12:00Z' })).toThrow()
  })
  it('keeps reviewers/ELT explicit and prevents disabling date confirmation', () => {
    const input = { version:0,reviewerIds:[requestId,requestId],executiveIds:[],approvalConfirmsDates:true }
    expect(productionSettings(input)).toMatchObject({ reviewerIds:[requestId] })
    expect(()=>productionSettings({ ...input, approvalConfirmsDates:false })).toThrow()
    expect(()=>productionSettings({ ...input, executiveIds:['bad-id'] })).toThrow()
  })
})
