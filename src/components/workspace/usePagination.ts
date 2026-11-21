import { useState } from 'react'

export type PaginationState = {
  start: number
  end: number
  total: number
  hasPrevious: boolean
  hasNext: boolean
  previous: () => void
  next: () => void
}

const PAGE_SIZE = 10

/** Page an already filtered and sorted list. A changed filter or workspace starts a new page sequence. */
export function usePagination<T>(rows: readonly T[], scope: readonly (string | boolean | null | undefined)[] = []) {
  const key = JSON.stringify(scope)
  const [position, setPosition] = useState({ key, index: 0 })
  const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1)
  const index = position.key === key ? Math.min(position.index, last) : 0
  if (position.key !== key || position.index !== index) setPosition({ key, index })

  const start = index * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, rows.length)
  const pagination: PaginationState = {
    start: start + 1,
    end,
    total: rows.length,
    hasPrevious: index > 0,
    hasNext: index < last,
    previous: () => { if (index > 0) setPosition({ key, index: index - 1 }) },
    next: () => { if (index < last) setPosition({ key, index: index + 1 }) },
  }
  return { pageRows: rows.slice(start, end), pagination }
}
