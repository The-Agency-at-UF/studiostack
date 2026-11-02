'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Spotlight from './Spotlight'
import { tours, tourStorageKey } from './tours'
import type { TourId } from './tours'

type Outcome = 'done' | 'skipped'
type Tour = { active: TourId | null; start: (id: TourId) => void; seen: (id: TourId) => boolean }
const TourContext = createContext<Tour | null>(null)

function readOutcomes(owner: string): Partial<Record<TourId, Outcome>> {
  try { const value: unknown = JSON.parse(localStorage.getItem(tourStorageKey(owner)) ?? '{}'); return value && typeof value === 'object' ? value : {} } catch { return {} }
}
function writeOutcome(owner: string, id: TourId, outcome: Outcome) {
  try { localStorage.setItem(tourStorageKey(owner), JSON.stringify({ ...readOutcomes(owner), [id]: outcome })) } catch { /* Storage unavailable */ }
}

export function TourProvider({ owner, isAdmin, autoStart, children }: { owner: string; isAdmin: boolean; autoStart: boolean; children: ReactNode }) {
  const [active, setActive] = useState<TourId | null>(null)
  const seen = useCallback((id: TourId) => !!owner && !!readOutcomes(owner)[id], [owner])
  const start = useCallback((id: TourId) => setActive(id), [])
  const close = useCallback((outcome: Outcome) => { if (active && owner) writeOutcome(owner, active, outcome); setActive(null) }, [active, owner])
  const finish = useCallback(() => close('done'), [close]), skip = useCallback(() => close('skipped'), [close])

  // A different account never inherits the previous account's open tour.
  useEffect(() => { setActive(autoStart && owner && !readOutcomes(owner).workspace ? 'workspace' : null) }, [autoStart, owner])

  const value = useMemo(() => ({ active, start, seen }), [active, start, seen])
  return <TourContext.Provider value={value}>
    {children}
    {active && <Spotlight key={active} steps={tours[active]({ isAdmin })} onFinish={finish} onSkip={skip} />}
  </TourContext.Provider>
}

/** Null outside the workspace shell, so shared components can offer the tour only where it runs. */
export const useTour = () => useContext(TourContext)
