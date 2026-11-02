import { useCallback, useState } from 'react'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { DayCellContentArg } from '@fullcalendar/core'

const pad = (n: number) => String(n).padStart(2, '0')

/** Calendar day key in the calendar's own time zone: UTC calendars read UTC fields, local calendars local fields. */
export function dayKey(date: Date, utc: boolean) {
  return utc
    ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Remembers the day a person clicked in a FullCalendar view and marks that day's cell with `ws-day-picked`. */
export function usePickedDay({ utc = false }: { utc?: boolean } = {}) {
  const [picked, setPicked] = useState('')
  const dateClick = useCallback((arg: DateClickArg) => setPicked(arg.dateStr.slice(0, 10)), [])
  const dayCellClassNames = useCallback((arg: DayCellContentArg) => dayKey(arg.date, utc) === picked ? ['ws-day-picked'] : [], [picked, utc])
  return { picked, dateClick, dayCellClassNames }
}
