'use client'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HiExclamationCircle } from 'react-icons/hi2'
import { Select } from '../../components/workspace/WorkspaceUI'
import { productionTypes, sectionId, visibleSections, type BriefData, type ClientAccount } from '../../types/production'

type Section = ReturnType<typeof visibleSections>[number]
type FieldHandlers = { form: BriefData; clients: ClientAccount[]; onChange: (key: keyof BriefData, value: string | string[]) => void; onField: (key: string, value: string) => void; onClientAccount: (id: string) => void }

const requestLabels = { projectName: 'Project name *', client: 'Client *', managers: 'Account / project managers *', supervisor: 'Production supervisor', deliveryDate: 'Target delivery date *' } as const
const requestHints: Record<keyof typeof requestLabels, string> = { projectName: 'This becomes the brief’s title.', client: 'Filled in automatically when you choose a client account.', managers: 'Who Production should contact.', supervisor: 'Optional.', deliveryDate: 'When the final files are due.' }
const requestErrors: Record<keyof typeof requestLabels, string> = { projectName: 'Add a project name.', client: 'Add the client, or choose a client account.', managers: 'Add at least one account or project manager.', supervisor: '', deliveryDate: 'Choose a target delivery date.' }
const typeHints: Record<typeof productionTypes[number], string> = { Photography: 'Stills on set or on location', Videography: 'Filming', 'Video Editing': 'Cutting existing or new footage', 'Motion Graphics': 'Animated graphics and titles' }

const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined
const FieldError = ({ id, children }: { id: string; children: ReactNode }) => <span className="production-field-error" id={id}><HiExclamationCircle aria-hidden="true" />{children}</span>

/** Request details: client, people, delivery date and production type. Required fields left empty turn red when showErrors is set. */
export function RequestFields({ form, clients, onChange, onClientAccount, hints = false, showErrors = false }: Omit<FieldHandlers, 'onField'> & { hints?: boolean; showErrors?: boolean }) {
  const invalid = (key: keyof typeof requestLabels) => showErrors && requestLabels[key].endsWith('*') && !form[key].trim()
  const typeInvalid = showErrors && !form.productionTypes.length
  return <>
    <div className="production-fields">
      <label>Client account<Select value={form.clientAccountId ?? ''} onChange={e => onClientAccount(e.target.value)}><option value="">Choose an account or enter a client below</option>{clients.filter(c => !c.deletedAt || c.id === form.clientAccountId).map(c => <option key={c.id} value={c.id}>{c.name}{c.deletedAt ? ' · Deleted' : ''}</option>)}</Select></label>
      {(Object.keys(requestLabels) as (keyof typeof requestLabels)[]).map(key => <div className="production-hinted" key={key}><label>{requestLabels[key]}<input aria-invalid={invalid(key) || undefined} aria-describedby={describedBy(invalid(key) ? `brief-error-${key}` : hints && `brief-hint-${key}`)} maxLength={key === 'managers' ? 500 : 160} type={key === 'deliveryDate' ? 'date' : 'text'} readOnly={key === 'client' && Boolean(form.clientAccountId)} value={form[key]} onChange={e => onChange(key, e.target.value)} /></label>{invalid(key) ? <FieldError id={`brief-error-${key}`}>{requestErrors[key]}</FieldError> : hints && <span className="production-hint" id={`brief-hint-${key}`}>{requestHints[key]}</span>}</div>)}
    </div>
    <div className={`${hints ? 'production-type-options production-type-tiles' : 'production-type-options'}${typeInvalid ? ' is-invalid' : ''}`}><span>Production type *</span>{typeInvalid && <FieldError id="brief-error-productionTypes">Choose at least one production type.</FieldError>}{productionTypes.map(t => <label key={t}><input type="checkbox" aria-invalid={typeInvalid || undefined} aria-describedby={typeInvalid ? 'brief-error-productionTypes' : undefined} checked={form.productionTypes.includes(t)} onChange={e => onChange('productionTypes', e.target.checked ? [...form.productionTypes, t] : form.productionTypes.filter(v => v !== t))} /><span>{t}{hints && <small>{typeHints[t]}</small>}</span></label>)}</div>
  </>
}

/** The fields of one optional or conditional brief section. */
export function SectionFields({ section, form, onField, showErrors = false }: Pick<FieldHandlers, 'form' | 'onField'> & { section: Section; showErrors?: boolean }) {
  return <div className="production-fields">{section.fields.map(f => {
    const invalid = showErrors && f.required && !form.fields[f.key]?.trim(), error = `brief-error-${f.key}`
    const a11y = { 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? error : undefined }
    return <div className={f.type === 'textarea' ? 'production-hinted production-wide' : 'production-hinted'} key={f.key}><label>{f.label}{f.required ? ' *' : ''}{f.type === 'textarea' ? <textarea {...a11y} rows={3} maxLength={6000} value={form.fields[f.key] ?? ''} onChange={e => onField(f.key, e.target.value)} /> : f.type === 'select' ? <Select {...a11y} value={form.fields[f.key] ?? ''} onChange={e => onField(f.key, e.target.value)}><option value="">Choose…</option>{f.options?.map(v => <option key={v}>{v}</option>)}</Select> : <input {...a11y} type={f.type ?? 'text'} maxLength={1000} value={form.fields[f.key] ?? ''} onChange={e => onField(f.key, e.target.value)} />}</label>{invalid && <FieldError id={error}>{f.type === 'select' || f.type === 'date' ? 'Choose an option.' : 'This field is required.'}</FieldError>}</div>
  })}</div>
}

type Step = { id: string; title: string; intro: string; missing: string[]; section?: Section }
function briefSteps(form: BriefData): Step[] {
  const request = (['projectName', 'client', 'managers', 'deliveryDate'] as const).filter(k => !form[k].trim()).map(k => requestLabels[k].replace(' *', ''))
  if (!form.productionTypes.length) request.push('Production type')
  return [
    { id: 'request', title: 'Basics', intro: 'Name the project, say who it is for, and when it is due.', missing: request },
    ...visibleSections(form).map(section => ({ id: sectionId(section.title), title: section.title, intro: section.fields.some(f => f.required) ? 'Fields marked * are required.' : 'Everything here is optional.', section, missing: section.fields.filter(f => f.required && !form.fields[f.key]?.trim()).map(f => f.label) })),
    { id: 'brief-attachments', title: 'Attachments', intro: 'Add scripts, shot lists, references or brand files.', missing: [] },
    { id: 'brief-review', title: 'Review & submit', intro: 'Check what is still needed, then send the brief to Production.', missing: [] },
  ]
}

/**
 * A draft brief as a series of steps. Moving between steps never saves: the draft
 * is saved only with Save draft, so unsaved edits carry from step to step.
 */
export default function BriefSteps({ form, clients, onChange, onField, onClientAccount, disabled, dirty, saveStatus, attachments, canSubmit, submitBlocked, onSubmit, reviewNotes }: FieldHandlers & { reviewNotes?: ReactNode; disabled: boolean; dirty: boolean; saveStatus: ReactNode; attachments: ReactNode; canSubmit: boolean; submitBlocked: boolean; onSubmit: () => void }) {
  const steps = briefSteps(form)
  const [stepId, setStepId] = useState('request')
  const index = Math.max(0, steps.findIndex(s => s.id === stepId))
  const step = steps[index], next = steps[index + 1], previous = steps[index - 1]
  const missing = steps.flatMap(s => s.missing.map(label => ({ label, step: s })))
  // Steps the person has left (or every step, once they reach Review or try to submit) show their empty required fields in red.
  const [checked, setChecked] = useState<Set<string>>(() => new Set()), [attempted, setAttempted] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null), moved = useRef(false), summary = useRef<HTMLDivElement>(null)
  // A conditional section can disappear when production types change; fall back to the step that now holds its place.
  useEffect(() => { if (step.id !== stepId) setStepId(step.id) }, [step.id, stepId])
  useEffect(() => { if (attempted) summary.current?.focus() }, [attempted])
  useEffect(() => { if (moved.current) { heading.current?.focus(); heading.current?.scrollIntoView?.({ block: 'nearest' }) } }, [stepId])
  const go = (id: string) => { moved.current = true; setChecked(c => new Set([...c, step.id, ...(id === 'brief-review' ? steps.map(s => s.id) : [])])); setStepId(id) }
  const shows = (id: string) => checked.has(id)
  const blocker = missing.length ? `Fill in ${missing.length === 1 ? 'the required detail' : `all ${missing.length} required details`} before submitting.` : dirty ? 'Save the draft before submitting.' : submitBlocked ? 'Wait for attachments to finish uploading before submitting.' : ''
  const submit = () => { if (blocker) { setAttempted(true); setChecked(new Set(steps.map(s => s.id))); summary.current?.focus(); return } onSubmit() }
  return <div className="production-steps">
    <nav aria-label="Brief steps"><ol style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>{steps.map((s, i) => <li key={s.id}><button type="button" aria-current={i === index ? 'step' : undefined} className={shows(s.id) && s.missing.length ? 'has-error' : i < index && !s.missing.length ? 'is-complete' : undefined} onClick={() => go(s.id)}><b aria-hidden="true">{shows(s.id) && s.missing.length ? '!' : i < index && !s.missing.length ? '✓' : i + 1}</b><span className="production-step-name">{s.title}{s.missing.length > 0 && (shows(s.id) ? <small><span className="sr-only"> · </span>{s.missing.length} missing</small> : <span className="sr-only"> · {s.missing.length} required left</span>)}</span></button></li>)}</ol></nav>
    <section className="production-step" aria-labelledby="brief-step-title">
      <header><p>Step {index + 1} of {steps.length}</p><h3 id="brief-step-title" ref={heading} tabIndex={-1}>{step.title === 'Basics' ? 'Start with the basics' : step.title}</h3><p>{step.intro}</p></header>
      {shows(step.id) && step.missing.length > 0 && step.id !== 'brief-review' && <p className="production-step-notice"><HiExclamationCircle aria-hidden="true" /><span><strong>{step.missing.length === 1 ? '1 required field is empty.' : `${step.missing.length} required fields are empty.`}</strong> You can keep going and fill {step.missing.length === 1 ? 'it' : 'them'} in before you submit.</span></p>}
      {step.id === 'request' && <fieldset id="brief-request" disabled={disabled}><legend className="sr-only">Request details</legend><RequestFields form={form} clients={clients} onChange={onChange} onClientAccount={onClientAccount} hints showErrors={shows('request')} /></fieldset>}
      {step.section && <fieldset id={step.id} disabled={disabled}><legend className="sr-only">{step.title}</legend><SectionFields section={step.section} form={form} onField={onField} showErrors={shows(step.id)} /></fieldset>}
      {step.id === 'brief-attachments' && attachments}
      {step.id === 'brief-review' && <div className="production-step-review">{attempted && blocker && <div className="production-error-summary" id="brief-submit-blocker" role="alert" tabIndex={-1} ref={summary}><HiExclamationCircle aria-hidden="true" />{blocker}</div>}{missing.length ? <><p><strong>Still needed · {missing.length}</strong></p><ul>{missing.map(m => <li key={m.step.id + m.label}><span>{m.label}</span><button type="button" className="production-link-button" aria-label={`Go to ${m.label} in ${m.step.title}`} onClick={() => go(m.step.id)}>{m.step.title} →</button></li>)}</ul></> : <p><strong>Required details are complete.</strong></p>}{dirty && !attempted && <p>Save the draft before submitting.</p>}<p>Shoot dates are confirmed when Production approves the brief.</p>{reviewNotes}</div>}
    </section>
    <div className="production-savebar">
      {saveStatus}
      <div>
        <button type="button" disabled={!previous} onClick={() => previous && go(previous.id)}>Back</button>
        <button type="submit" disabled={disabled || !dirty}>{disabled ? 'Saving…' : 'Save draft'}</button>
        {next ? <button type="button" className="production-primary" onClick={() => go(next.id)}>Next: {next.title}</button> : canSubmit && <button type="button" className="production-primary" disabled={disabled} aria-describedby={attempted && blocker ? 'brief-submit-blocker' : undefined} onClick={submit}>Submit for review</button>}
      </div>
    </div>
  </div>
}
