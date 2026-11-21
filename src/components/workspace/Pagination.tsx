import { Button } from './WorkspaceUI'
import type { PaginationState } from './usePagination'

export function Pagination({ label, pagination }: { label: string; pagination: PaginationState }) {
  const { start, end, total, hasPrevious, hasNext, previous, next } = pagination
  if (!hasPrevious && !hasNext) return null

  return <nav className="ws-pagination" aria-label={`${label} pagination`}>
    <span className="ws-pagination-range" aria-live="polite" aria-atomic="true">Showing {start}–{end} of {total}</span>
    <div className="ws-pagination-actions">
      <Button aria-disabled={!hasPrevious} onClick={previous}>Previous</Button>
      <Button aria-disabled={!hasNext} onClick={next}>Next</Button>
    </div>
  </nav>
}
