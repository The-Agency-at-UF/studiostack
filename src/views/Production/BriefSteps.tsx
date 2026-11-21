'use client'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { HiExclamationCircle } from 'react-icons/hi2'
import { dateErrors, sectionId, visibleSections, type BriefData } from '../../types/production'

import {RequestFields,type FieldHandlers,type Section} from './BriefFields'

type Step = { id: string; title: string; intro: string; missing: string[]; section?: Section }
function briefSteps(form: BriefData): Step[] {
  const dates = dateErrors(form)
  const request = (['projectName', 'client', 'managers', 'deliveryDate'] as const).filter(k => !form[k].trim()).map(k => ({projectName:'Project name',client:'Client',managers:'Account / project managers',deliveryDate:'Target delivery date'})[k])
  request.push(...dates.filter(error => error.key === 'deliveryDate').map(error => error.message))
  if (!form.productionTypes.length) request.push('Production type')
  return [
    { id: 'request', title: 'Basics', intro: 'Name the project, say who it is for, and when it is due.', missing: request },
    ...visibleSections(form).map(section => ({ id: sectionId(section.title), title: section.title, intro: section.fields.some(f => f.required) ? 'Fields marked * are required.' : 'Everything here is optional.', section, missing: [...section.fields.filter(f => f.required && !form.fields[f.key]?.trim()).map(f => f.label), ...dates.filter(error => section.fields.some(field => field.key === error.key)).map(error => error.message)] })),
    {id:'brief-crew-requests',title:'Crew',intro:'Request the roles, dates and locations this production needs.',missing:[]},
    { id: 'brief-review', title: 'Review & submit', intro: 'Check what is still needed, then send the brief to Production.', missing: [] },
  ]
}

/**
 * A draft brief as a series of steps. Moving between steps never saves: the draft
 * is saved only with Save draft, so unsaved edits carry from step to step.
 */
export default function BriefSteps({ form, clients, onChange, onClientAccount, disabled, dirty, saveStatus, clientField, renderSection, crewRequests, scheduling, canSubmit, submitBlocked, onSubmit, reviewNotes }: FieldHandlers & { reviewNotes?: ReactNode; disabled: boolean; dirty: boolean; saveStatus: ReactNode; clientField:ReactNode;renderSection:(section:Section,showErrors:boolean)=>ReactNode;crewRequests:ReactNode;scheduling:ReactNode; canSubmit: boolean; submitBlocked: boolean; onSubmit: () => void }) {
  const steps = briefSteps(form)
  const [stepId, setStepId] = useState('request')
  const index = Math.max(0, steps.findIndex(s => s.id === stepId))
  const step = steps[index], next = steps[index + 1], previous = steps[index - 1]
  const missing = steps.flatMap(s => s.missing.map(label => ({ label, step: s })))
  // Steps the person has left (or every step, once they reach Review or try to submit) show their empty required fields in red.
  const [checked, setChecked] = useState<Set<string>>(() => new Set()), [attempted, setAttempted] = useState(false)
  // Steps the person actually opened. Only these earn a ✓, so jumping ahead never marks unseen steps done.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['request']))
  const heading = useRef<HTMLHeadingElement>(null), moved = useRef(false), summary = useRef<HTMLDivElement>(null)
  // A conditional section can disappear when production types change; fall back to the step that now holds its place.
  useEffect(() => { if (step.id !== stepId) setStepId(step.id) }, [step.id, stepId])
  useEffect(() => { if (attempted) summary.current?.focus() }, [attempted])
  useEffect(() => { if (moved.current) { heading.current?.focus(); heading.current?.scrollIntoView?.({ block: 'nearest' }) } }, [stepId])
  const go = (id: string) => { if(disabled)return; moved.current = true; setChecked(c => new Set([...c, step.id, ...(id === 'brief-review' ? steps.map(s => s.id) : [])])); setVisited(v => new Set([...v, id])); setStepId(id) }
  const shows = (id: string) => checked.has(id)
  const done = (s: Step, i: number) => i !== index && s.id !== 'brief-review' && visited.has(s.id) && !s.missing.length
  const blocker = missing.length ? `Fix all ${missing.length} ${missing.length === 1 ? 'item' : 'items'} still needed before submitting.` : dirty ? 'Save the draft before submitting.' : submitBlocked ? 'Wait for attachments to finish uploading before submitting.' : ''
  const submit = () => { if (blocker) { setAttempted(true); setChecked(new Set(steps.map(s => s.id))); summary.current?.focus(); return } onSubmit() }
  return <div className="production-steps">
    <nav aria-label="Brief steps"><ol style={{ '--brief-step-count': steps.length } as CSSProperties}>{steps.map((s, i) => <li key={s.id}><button type="button" disabled={disabled} aria-current={i === index ? 'step' : undefined} className={shows(s.id) && s.missing.length ? 'has-error' : done(s, i) ? 'is-complete' : undefined} onClick={() => go(s.id)}><b aria-hidden="true">{shows(s.id) && s.missing.length ? '!' : done(s, i) ? '✓' : i + 1}</b><span className="production-step-name">{s.title}{s.missing.length > 0 && (shows(s.id) ? <small><span className="sr-only"> · </span>{s.missing.length} missing</small> : <span className="sr-only"> · {s.missing.length} missing</span>)}</span></button></li>)}</ol></nav>
    <section className="production-step" aria-labelledby="brief-step-title">
      <header><p>Step {index + 1} of {steps.length}</p><h3 id="brief-step-title" ref={heading} tabIndex={-1}>{step.title === 'Basics' ? 'Start with the basics' : step.title}</h3><p>{step.intro}</p></header>
      {shows(step.id) && step.missing.length > 0 && step.id !== 'brief-review' && <p className="production-step-notice"><HiExclamationCircle aria-hidden="true" /><span><strong>{step.missing.length === 1 ? '1 item needs attention.' : `${step.missing.length} items need attention.`}</strong> You can keep going and return to this step before you submit.</span></p>}
      {step.id === 'request' && <fieldset id="brief-request" disabled={disabled}><legend className="sr-only">Request details</legend><RequestFields form={form} clients={clients} onChange={onChange} onClientAccount={onClientAccount} clientField={clientField} hints showErrors={shows('request')} /></fieldset>}
      {step.section && renderSection(step.section,shows(step.id))}
      <fieldset hidden={step.id!=='brief-crew-requests'} disabled={disabled||step.id!=='brief-crew-requests'} aria-label="Crew requests">{crewRequests}</fieldset>
      <fieldset hidden={step.section?.title!=='Timeline'} disabled={disabled||step.section?.title!=='Timeline'} aria-label="Shoot date proposals">{scheduling}</fieldset>
      {step.id === 'brief-review' && <div className="production-step-review">{attempted && blocker && <div className="production-error-summary" id="brief-submit-blocker" role="alert" tabIndex={-1} ref={summary}><HiExclamationCircle aria-hidden="true" />{blocker}</div>}{missing.length ? <><p><strong>Still needed · {missing.length}</strong></p><ul>{missing.map(m => <li key={m.step.id + m.label}><span>{m.label}</span><button type="button" className="production-link-button" aria-label={`Go to ${m.label} in ${m.step.title}`} onClick={() => go(m.step.id)}>{m.step.title} →</button></li>)}</ul></> : <p><strong>Required details are complete.</strong></p>}{dirty && !attempted && <p>Save the draft before submitting.</p>}{!canSubmit && <p id="brief-submit-owner"><strong>Only the person who created this brief can submit it.</strong></p>}<p>Shoot dates are confirmed when Production approves the brief.</p>{reviewNotes}</div>}
    </section>
    <div className="production-savebar">
      {saveStatus}
      <div>
        <button type="button" disabled={disabled||!previous} onClick={() => previous && go(previous.id)}>Back</button>
        <button type="submit" disabled={disabled || !dirty}>{disabled ? 'Saving…' : 'Save draft'}</button>
        {next ? <button type="button" className="production-primary" disabled={disabled} onClick={() => go(next.id)}>Next: {next.title}</button> : canSubmit ? <button type="button" className="production-primary" disabled={disabled} aria-describedby={attempted && blocker ? 'brief-submit-blocker' : undefined} onClick={submit}>Submit for review</button> : <button type="button" className="production-primary" disabled aria-describedby="brief-submit-owner">Submit for review</button>}
      </div>
    </div>
  </div>
}
