import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useState } from 'react'
import type { ProductionBrief } from '../../types/production'
export default function ProductionCalendar({ briefs, onOpen }: { briefs: ProductionBrief[]; onOpen: (id: string) => void }) {
  const [tentative,setTentative] = useState(true), [milestones,setMilestones] = useState(true)
  const events = briefs.flatMap(b => {
    if (['denied','withdrawn','draft'].includes(b.status)) return []
    const items = []
    if (b.shootStartsAt) items.push({ id: `${b.id}:shoot`, title: `${b.data.projectName} · confirmed shoot`, start: b.shootStartsAt, end: b.shootEndsAt!, allDay: true, backgroundColor: '#5302D8', borderColor: '#5302D8', extendedProps: { briefId: b.id } })
    else if (tentative && b.data.fields.proposedStart) items.push({ id: `${b.id}:proposed`, title: `${b.data.projectName} · tentative`, start: b.data.fields.proposedStart, end: new Date(Date.parse(b.data.fields.proposedEnd) + 86400_000).toISOString().slice(0,10), allDay: true, backgroundColor: '#e7dfff', borderColor: '#AB9BFF', textColor: '#271548', extendedProps: { briefId: b.id } })
    if (milestones) for (const [key,label] of [['deliveryDate','Delivery'],['preProduction','Pre-production'],['roughCut','Rough cut'],['internalReview','Internal review'],['firstRevisions','Revisions'],['clientReview','Client review'],['secondRevisions','Client revisions'],['finalApproval','Final approval']]) { const date = key === 'deliveryDate' ? b.data.deliveryDate : b.data.fields[key]; if (date) items.push({ id: `${b.id}:${key}`, title: `${b.data.projectName} · ${label}`, start: date, allDay: true, backgroundColor: '#333333', borderColor: '#333333', extendedProps: { briefId: b.id } }) }
    return items
  })
  const unscheduled = briefs.filter(b => !['draft','denied','withdrawn'].includes(b.status) && !b.shootStartsAt && !b.data.fields.proposedStart && b.data.productionTypes.some(t=>['Photography','Videography'].includes(t)))
  return <section className="production-calendar"><div className="production-calendar-options"><h2>Production calendar</h2><label><input type="checkbox" checked={tentative} onChange={e=>setTentative(e.target.checked)} />Tentative shoots</label><label><input type="checkbox" checked={milestones} onChange={e=>setMilestones(e.target.checked)} />Milestones</label></div><p>Confirmed shoots are purple; tentative windows are light purple. Select an event to open its brief.</p><FullCalendar plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialView="dayGridMonth" timeZone="UTC" height="auto" headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }} events={events} eventClick={e=>onOpen(e.event.extendedProps.briefId)} eventDidMount={e => { e.el.setAttribute('aria-label',e.event.title); e.el.setAttribute('tabindex','0'); e.el.addEventListener('keydown', k=>{ if(k.key==='Enter'||k.key===' ') { k.preventDefault(); onOpen(e.event.extendedProps.briefId) } }) }} dayMaxEvents={3} />{!events.length && <p className="production-empty">No dated briefs yet. Add projected shoot dates or milestones to a brief.</p>}{unscheduled.length > 0 && <section className="production-unscheduled"><h3>Awaiting shoot dates</h3>{unscheduled.map(b=><button key={b.id} onClick={()=>onOpen(b.id)}>{b.data.projectName} · {b.data.fields.shootEstimate || 'No estimate'}</button>)}</section>}</section>
}
