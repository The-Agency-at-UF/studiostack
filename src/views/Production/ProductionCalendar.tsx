import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useState, type ReactNode } from 'react'
import {softHoldsFor} from '../../production/readiness'
import {getCached,setCached} from '../../api/cache'
import { productionIsOnSite, statusLabels, type ProductionBrief } from '../../types/production'
import { usePickedDay } from '../../components/workspace/usePickedDay'
import { WorkspaceCalendar } from '../../components/workspace/WorkspaceCalendar'
import { Button } from '../../components/workspace/WorkspaceUI'
import { revealPanel } from '../../components/workspace/revealPanel'

type Kind = 'shoot' | 'tentative' | 'milestone'
type Entry = { id: string; brief: ProductionBrief; kind: Kind; title: string; badge: string; when: string; start: string; end?: string }
const milestoneFields = [['conceptReview','Concept review'],['locationConfirmed','Location confirmed'],['paperworkDue','Signed paperwork due'],['assetsDue','Brand assets due'],['deliveryDate','Delivery'],['preProduction','Pre-production'],['roughCut','Rough cut'],['internalReview','Internal review'],['firstRevisions','Revisions'],['clientReview','Client review'],['secondRevisions','Client revisions'],['finalApproval','Final approval']] as const
const views = [{ value: 'dayGridMonth', label: 'Month' }, { value: 'timeGridWeek', label: 'Week' }]
const kindLabel: Record<Kind, string> = { shoot: 'Confirmed shoot', tentative: 'Soft hold (unconfirmed)', milestone: 'Milestone' }
// Brief dates are calendar days stored in UTC; format them without shifting into the viewer's zone.
const day = (value: string | number, options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(value).toLocaleDateString(undefined, { ...options, ...(new Date(value).getUTCFullYear() !== new Date().getUTCFullYear() ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const short = (value: string | number) => day(value, { month: 'short', day: 'numeric' })
const range = (start: string | number, lastDay: string | number) => short(start) === short(lastDay) ? day(start) : `${day(start)} – ${day(lastDay)}`
const milestoneDate = (brief: ProductionBrief, key: string) => key === 'deliveryDate' ? brief.data.deliveryDate : brief.data.fields[key]

/** A brief's dated work: its confirmed or tentative shoot and each milestone with a date. */
function entries(brief: ProductionBrief, tentative: boolean, milestones: boolean): Entry[] {
  if (['denied','withdrawn','draft'].includes(brief.status)) return []
  const name = brief.data.projectName || 'Untitled brief', items: Entry[] = []
  if (brief.shootStartsAt) items.push({ id: `${brief.id}:shoot`, brief, kind: 'shoot', title: name, badge: kindLabel.shoot, when: range(brief.shootStartsAt, Date.parse(brief.shootEndsAt!) - 1), start: brief.shootStartsAt, end: brief.shootEndsAt! })
  else if(tentative)for(const hold of softHoldsFor(brief))items.push({id:`${brief.id}:${hold.id}`,brief,kind:'tentative',title:`${name} · unconfirmed`,badge:'Unconfirmed soft hold',when:range(hold.startsAt,Date.parse(hold.endsAt)-1),start:hold.startsAt,end:hold.endsAt})
  if (milestones) for (const [key,label] of milestoneFields) { const date = milestoneDate(brief, key); if (date) items.push({ id: `${brief.id}:${key}`, brief, kind: 'milestone', title: `${name} · ${label}`, badge: `Milestone · ${label}`, when: day(date), start: date }) }
  return items
}
const shortRange = (start: string | number, lastDay: string | number) => short(start) === short(lastDay) ? short(start) : `${short(start)} – ${short(lastDay)}`
function shootSummary(brief: ProductionBrief) {
  if (brief.shootStartsAt) return `${shortRange(brief.shootStartsAt, Date.parse(brief.shootEndsAt!) - 1)} · Confirmed`
  const holds = softHoldsFor(brief)
  if (holds.length === 1) return `${shortRange(holds[0].startsAt, Date.parse(holds[0].endsAt) - 1)} · Tentative`
  if (holds.length > 1) return `${holds.length} unconfirmed soft holds`
  return productionIsOnSite(brief.data) && brief.data.fields.shootEstimate ? `Estimate: ${brief.data.fields.shootEstimate}` : 'Not scheduled'
}

export default function ProductionCalendar({ briefs, onOpen, viewKey = 'default', filter, showSoftHoldsByDefault=false }: { briefs: ProductionBrief[]; onOpen: (id: string) => void; viewKey?: string; filter?: ReactNode;showSoftHoldsByDefault?:boolean }) {
  const [initial] = useState(()=>getCached<{date:string;view:string}>(`production-calendar-view:${viewKey}`,86_400_000))
  const [confirmed,setConfirmed]=useState(true), [tentative,setTentative] = useState(showSoftHoldsByDefault), [milestones,setMilestones] = useState(true), [selected,setSelected] = useState('')
  const pickedDay = usePickedDay({ utc: true })
  const all = briefs.flatMap(b => entries(b, tentative, milestones)).filter(e=>e.kind!=='shoot'||confirmed), current = all.find(e => e.id === selected)
  const events = all.map(e => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: true, classNames: ['ws-event', `ws-event--${e.kind}`, ...(e.id === selected ? ['is-selected'] : [])], extendedProps: { label: `${e.badge}: ${e.title}, ${e.when}` } }))
  const unscheduled = briefs.filter(b => !['draft','denied','withdrawn'].includes(b.status) && !b.shootStartsAt && softHoldsFor(b).length===0 && b.data.productionTypes.some(t=>['Photography','Videography'].includes(t)))
  return <section className="production-calendar">
    <div className="ws-calendar-filters">
      <div className="ws-calendar-filters-group">{filter}
        <div className="ws-calendar-toggles" role="group" aria-label="Show on calendar">
          <label className="ws-check-chip"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmed shoots</label>
          <label className="ws-check-chip"><input type="checkbox" checked={tentative} onChange={e=>setTentative(e.target.checked)} />Soft holds (unconfirmed)</label>
          <label className="ws-check-chip"><input type="checkbox" checked={milestones} onChange={e=>setMilestones(e.target.checked)} />Milestones</label>
        </div>
      </div>
      <ul className="ws-calendar-legend" aria-label="Legend">{(['shoot','tentative','milestone'] as Kind[]).map(k => <li key={k}><span className={`ws-swatch ws-swatch--${k}`} aria-hidden="true" />{kindLabel[k]}</li>)}</ul>
    </div>
    <div className="ws-calendar-layout">
      <WorkspaceCalendar label="Production schedule" viewChoices={views} dateClick={pickedDay.dateClick} dayCellClassNames={pickedDay.dayCellClassNames} plugins={[dayGridPlugin,timeGridPlugin,interactionPlugin]} initialView={initial?.view??'dayGridMonth'} initialDate={initial?.date} datesSet={arg=>setCached(`production-calendar-view:${viewKey}`,{date:arg.view.currentStart.toISOString(),view:arg.view.type})} timeZone="UTC" events={events} eventClick={e=>{setSelected(e.event.id);revealPanel('.ws-calendar-aside [aria-label="Selected production event"] h2')}} dayMaxEvents={3} />
      <aside className="ws-calendar-aside" aria-label="Event details">
        {current ? <SelectedEvent entry={current} onOpen={onOpen} /> : <section className="ws-calendar-card" aria-label="Selected production event"><h2 className="ws-calendar-card-title">Event details</h2><p>Select a shoot or milestone on the calendar to see its brief.</p></section>}
        {unscheduled.length > 0 && <section className="ws-calendar-card" aria-label="Awaiting shoot dates">
          <div><h2 className="ws-calendar-card-title">Awaiting shoot dates</h2><p>Photo and video briefs without a shoot on the calendar.</p></div>
          <ul className="ws-calendar-rows">{unscheduled.map(b=><li key={b.id}><button type="button" onClick={()=>onOpen(b.id)}><strong>{b.data.projectName || 'Untitled brief'}</strong><span>{b.data.fields.shootEstimate ? `Est. ${b.data.fields.shootEstimate}` : 'No estimate'}</span></button></li>)}</ul>
        </section>}
      </aside>
    </div>
  </section>
}

function SelectedEvent({ entry, onOpen }: { entry: Entry; onOpen: (id: string) => void }) {
  const { brief } = entry, crew = brief.crew?.length ?? 0
  const dated = milestoneFields.flatMap(([key,label]) => { const date = milestoneDate(brief, key); return date ? [{ key, label, date }] : [] }).sort((a,b) => a.date.localeCompare(b.date))
  return <section className="ws-calendar-card" aria-label="Selected production event">
    <header><span className={`ws-calendar-badge ws-event--${entry.kind}`}>{entry.badge}</span><h2>{brief.data.projectName || 'Untitled brief'}</h2><p>{[brief.data.client, statusLabels[brief.status]].filter(Boolean).join(' · ')}</p></header>
    <dl className="ws-calendar-facts"><dt>This event</dt><dd className="is-strong">{entry.when}</dd><dt>Shoot</dt><dd>{shootSummary(brief)}</dd><dt>Crew</dt><dd>{crew ? `${crew} crew assigned` : 'Awaiting crew'}</dd></dl>
    {dated.length > 0 && <div><h3>Milestones</h3><ul className="ws-calendar-list">{dated.map(m => <li key={m.key}><span className="ws-milestone-label">{m.label}</span><span>{short(m.date)}</span></li>)}</ul></div>}
    <Button variant="primary" onClick={() => onOpen(brief.id)}>Open production brief</Button>
  </section>
}
