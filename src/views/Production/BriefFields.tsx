import {Fragment,type ReactNode} from 'react'
import {HiExclamationCircle} from 'react-icons/hi2'
import {Select} from '../../components/workspace/WorkspaceUI'
import {dateErrors,productionTypes,visibleSections,type BriefData,type ClientAccount} from '../../types/production'

export type Section = ReturnType<typeof visibleSections>[number]
export type FieldHandlers = { form: BriefData; clients: ClientAccount[]; onChange: (key: keyof BriefData, value: string | string[]) => void; onField: (key: string, value: string) => void; onClientAccount: (id: string) => void }

const requestLabels = { projectName: 'Project name', client: 'Client', managers: 'Account / project managers', supervisor: 'Production supervisor', deliveryDate: 'Target delivery date' } as const
const requestHints: Record<keyof typeof requestLabels, string> = { projectName: 'This becomes the brief’s title.', client: 'Filled in automatically when you choose a client account.', managers: 'Who Production should contact.', supervisor: 'Optional.', deliveryDate: 'When the final files are due.' }
const requestErrors: Record<keyof typeof requestLabels, string> = { projectName: 'Add a project name.', client: 'Add the client, or choose a client account.', managers: 'Add at least one account or project manager.', supervisor: '', deliveryDate: 'Choose a target delivery date.' }
const typeHints: Record<typeof productionTypes[number], string> = { Photography: 'Stills on set or on location', Videography: 'Filming', 'Video Editing': 'Cutting existing or new footage', 'Motion Graphics': 'Animated graphics and titles' }

const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined
const FieldError = ({ id, children }: { id: string; children: ReactNode }) => <span className="production-field-error" id={id}><HiExclamationCircle aria-hidden="true" />{children}</span>

/** Request details: client, people, delivery date and production type. Required fields left empty turn red when showErrors is set. */
export function RequestFields({ form, clients, onChange, onClientAccount, hints = false, showErrors = false, clientField }: Omit<FieldHandlers, 'onField'> & { hints?: boolean; showErrors?: boolean;clientField?:ReactNode }) {
  const deliveryError = dateErrors(form).find(error => error.key === 'deliveryDate')?.message
  const invalid = (key: keyof typeof requestLabels) => key === 'deliveryDate' && Boolean(deliveryError) || showErrors && (key !== 'supervisor') && !form[key].trim()
  const typeInvalid = showErrors && !form.productionTypes.length
  return <>
    <div className="production-fields">
      {clientField??(<label>Client account<Select value={form.clientAccountId ?? ''} onChange={e => onClientAccount(e.target.value)}><option value="">Choose an account or enter a client below</option>{clients.filter(c => !c.deletedAt || c.id === form.clientAccountId).map(c => <option key={c.id} value={c.id}>{c.name}{c.deletedAt ? ' (Deleted)' : ''}</option>)}</Select></label>)}
      {(Object.keys(requestLabels) as (keyof typeof requestLabels)[]).map(key => <div className="production-hinted" key={key}><label><span>{requestLabels[key]}{key !== 'supervisor' && <span aria-hidden="true"> (required)</span>}</span><input aria-required={(key !== 'supervisor') || undefined} aria-invalid={invalid(key) || undefined} aria-describedby={describedBy(invalid(key) ? `brief-error-${key}` : hints && `brief-hint-${key}`)} maxLength={key === 'managers' ? 500 : 160} type={key === 'deliveryDate' ? 'date' : 'text'} readOnly={key === 'client' && Boolean(form.clientAccountId)} value={form[key]} onChange={e => onChange(key, e.target.value)} /></label>{invalid(key) ? <FieldError id={`brief-error-${key}`}>{key === 'deliveryDate' && deliveryError ? deliveryError : requestErrors[key]}</FieldError> : hints && <span className="production-hint" id={`brief-hint-${key}`}>{requestHints[key]}</span>}</div>)}
    </div>
    <fieldset className={`${hints ? 'production-type-options production-type-tiles' : 'production-type-options'}${typeInvalid ? ' is-invalid' : ''}`} aria-describedby={typeInvalid ? 'brief-error-productionTypes' : undefined}><legend>Production type (required, choose at least one)</legend>{typeInvalid && <FieldError id="brief-error-productionTypes">Choose at least one production type.</FieldError>}{productionTypes.map(t => <label key={t}><input type="checkbox" aria-invalid={typeInvalid || undefined} aria-describedby={typeInvalid ? 'brief-error-productionTypes' : undefined} checked={form.productionTypes.includes(t)} onChange={e => onChange('productionTypes', e.target.checked ? [...form.productionTypes, t] : form.productionTypes.filter(v => v !== t))} /><span>{t}{hints && <small>{typeHints[t]}</small>}</span></label>)}</fieldset>
  </>
}

/** The fields of one optional or conditional brief section. */
export function SectionFields({ section, form, onField, showErrors = false, disabled=false, afterField }: Pick<FieldHandlers, 'form' | 'onField'> & { section: Section; showErrors?: boolean;disabled?:boolean;afterField?:(key:string)=>ReactNode }) {
  const dates = disabled ? [] : dateErrors(form)
  return <div className="production-fields">{section.fields.map(f => {
    const dateError = dates.find(error => error.key === f.key)?.message
    const invalid = Boolean(dateError) || showErrors && f.required && !form.fields[f.key]?.trim(), error = `brief-error-${f.key}`
    const a11y = { 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? error : undefined, 'aria-required': f.required || undefined }
    return <Fragment key={f.key}><div className={f.type === 'textarea' ? 'production-hinted production-wide' : 'production-hinted'}><label><span>{f.label}{f.required && <span aria-hidden="true"> (required)</span>}</span>{f.type === 'textarea' ? <textarea disabled={disabled} {...a11y} rows={3} maxLength={6000} value={form.fields[f.key] ?? ''} onChange={e => onField(f.key, e.target.value)} /> : f.type === 'select' ? <Select disabled={disabled} {...a11y} value={form.fields[f.key] ?? ''} onChange={e => onField(f.key, e.target.value)}><option value="">Choose…</option>{f.options?.map(v => <option key={v}>{v}</option>)}</Select> : <input disabled={disabled} {...a11y} type={f.type ?? 'text'} maxLength={1000} value={form.fields[f.key] ?? ''} onChange={e => onField(f.key, e.target.value)} />}</label>{invalid && <FieldError id={error}>{dateError ?? (f.type === 'select' || f.type === 'date' ? 'Choose an option.' : 'This field is required.')}</FieldError>}</div>{afterField?.(f.key)}</Fragment>
  })}</div>
}
