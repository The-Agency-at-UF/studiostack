import { proposedWindow, type ProductionBrief, type SoftHold } from '../types/production'

/** Includes old projected windows until a brief has explicit date proposals. */
export function softHoldsFor(brief: ProductionBrief): SoftHold[] {
  if (brief.softHolds) return brief.softHolds
  const projected = proposedWindow(brief.data)
  return projected ? [{ id: 'projected', startsAt: `${projected.start}T00:00:00.000Z`, endsAt: new Date(Date.parse(projected.end) + 86400000).toISOString() }] : []
}
export function productionReadiness(brief: ProductionBrief, now = Date.now()) {
  const onsite = brief.data.productionTypes.some(t => ['Photography','Videography'].includes(t))
  const requests = brief.data.crewRequests ?? [], crew = brief.crew ?? []
  const crewConfirmed = requests.length ? requests.every(r => crew.some(a => a.crewRequestId === r.id)) : crew.length > 0
  const checks = [
    { label: 'Approved shoot date', complete: !onsite || Boolean(brief.shootStartsAt) },
    { label: 'Approved brief', complete: brief.status === 'approved' },
    { label: 'Confirmed crew members', complete: crewConfirmed },
  ]
  const dates = brief.shootStartsAt ? [brief.shootStartsAt] : softHoldsFor(brief).map(h => h.startsAt)
  const ends = brief.shootEndsAt ? [brief.shootEndsAt] : softHoldsFor(brief).map(h => h.endsAt)
  const upcoming = dates.some((date, i) => Date.parse(date) <= now + 3 * 86400000 && Date.parse(ends[i]) > now)
  const missing = checks.filter(c => !c.complete).map(c => c.label)
  return { checks, missing, flagged: onsite && !['draft','denied','withdrawn'].includes(brief.status) && upcoming && missing.length > 0 }
}
