'use client'
import { useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { CalendarOptions, DatesSetArg, DayCellContentArg, EventContentArg, EventMountArg } from '@fullcalendar/core'
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi2'

export type CalendarView = { value: string; label: string }

/** Event chip body: a status mark followed by the title, truncated on one line. */
function calendarEventContent(arg: EventContentArg) {
  return <span className="ws-event-content"><span className="ws-event-mark" aria-hidden="true" /><span className="ws-event-title">{arg.event.title}</span></span>
}

/**
 * FullCalendar inside the workspace calendar card: its own toolbar (previous, next,
 * today, title, view switch) and a month grid that scrolls sideways on narrow screens.
 * Events style themselves with `ws-event` classes; see calendar.css.
 */
export function WorkspaceCalendar({ label, viewChoices, datesSet, eventDidMount, ...options }: { label: string; viewChoices: CalendarView[] } & CalendarOptions) {
  const calendar = useRef<FullCalendar>(null)
  const [title, setTitle] = useState(''), [view, setView] = useState(options.initialView ?? viewChoices[0]?.value)
  const api = () => calendar.current?.getApi()
  const utc = options.timeZone === 'UTC'
  // A month grid labels the first day of the following month with its month name.
  const dayCell = (arg: DayCellContentArg) => {
    const first = (utc ? arg.date.getUTCDate() : arg.date.getDate()) === 1
    return arg.isOther && first && arg.view.type === 'dayGridMonth' ? arg.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) }) : arg.dayNumberText
  }
  const changed = (arg: DatesSetArg) => { setTitle(arg.view.title); setView(arg.view.type); datesSet?.(arg) }
  // Event chips are links without an href; make them reachable and operable from the keyboard.
  const mounted = (arg: EventMountArg) => {
    const element = arg.el
    element.setAttribute('tabindex', '0'); element.setAttribute('role', 'button'); element.setAttribute('aria-label', String(arg.event.extendedProps.label ?? arg.event.title))
    element.addEventListener('keydown', key => { if (key.key === 'Enter' || key.key === ' ') { key.preventDefault(); element.click() } })
    if (typeof eventDidMount === 'function') eventDidMount(arg)
  }
  return <section className="ws-calendar" aria-label={label}>
    <div className="ws-calendar-toolbar">
      <div className="ws-calendar-nav">
        <button type="button" aria-label="Previous" onClick={() => api()?.prev()}><HiOutlineChevronLeft aria-hidden="true" /></button>
        <button type="button" aria-label="Next" onClick={() => api()?.next()}><HiOutlineChevronRight aria-hidden="true" /></button>
        <button type="button" onClick={() => api()?.today()}>Today</button>
      </div>
      <h2 className="ws-calendar-title" aria-live="polite">{title}</h2>
      {viewChoices.length > 1 && <div className="ws-calendar-views" role="group" aria-label="Calendar view">
        {viewChoices.map(item => <button key={item.value} type="button" aria-pressed={view === item.value} onClick={() => api()?.changeView(item.value)}>{item.label}</button>)}
      </div>}
    </div>
    <div className="ws-calendar-scroll"><div className="ws-calendar-grid">
      <FullCalendar ref={calendar} headerToolbar={false} height="auto" eventDisplay="block" fixedWeekCount={false} dayCellContent={dayCell} eventContent={calendarEventContent} eventDidMount={mounted} {...options} datesSet={changed} />
    </div></div>
  </section>
}
