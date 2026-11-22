import { TabPill } from './TabPill'
import { tabId, tabKeys, tabsPanelId } from './tabs'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return <header className="ws-page-header"><div><h1>{title}</h1></div>{actions && <div className="ws-actions">{actions}</div>}</header>
}
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-solid' | 'quiet' | 'link'
/** The one button primitive. Use variant="primary" for the single main action of a view. */
export function Button({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`ws-button ws-button-${variant} ${className}`.trim()} {...props} />
}
/** Inline feedback. `action` sits at the end of the notice, e.g. a Retry button. */
export function Notice({ children, kind = 'info', action, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { kind?: 'info' | 'error' | 'success' | 'warning'; action?: ReactNode }) {
  return <div className={`ws-notice ws-notice-${kind} ${className}`.trim()} role={kind === 'error' ? 'alert' : 'status'} {...props}><div className="ws-notice-body">{children}</div>{action && <div className="ws-notice-action">{action}</div>}</div>
}
/** A read that failed. Never shown as an empty list or a zero count. */
export function LoadError({ what, message, onRetry, retrying = false }: { what: string; message: string; onRetry?: () => void; retrying?: boolean }) {
  return <Notice kind="error" action={onRetry && <Button onClick={onRetry} disabled={retrying}>{retrying ? 'Retrying…' : 'Retry'}</Button>}><strong>{what} couldn’t load.</strong> {message}</Notice>
}
/** Empty states say what is missing and what to do next; `action` holds the next step (a link or button). */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="ws-empty"><p className="ws-empty-title">{title}</p>{children && <div className="ws-empty-body">{children}</div>}{action && <div className="ws-empty-action">{action}</div>}</div>
}
/** Placeholder shaped like the content it stands in for; the label is announced to screen readers. */
export function Skeleton({ label, variant = 'text', count = 3 }: { label: string; variant?: 'text' | 'row' | 'tile'; count?: number }) {
  return <div className={`ws-skeleton ws-skeleton-${variant} ws-loading-delayed`} role="status"><span className="ws-sr-only">{label}</span>{Array.from({ length: count }, (_, i) => <span key={i} className="ws-skeleton-block" aria-hidden="true" />)}</div>
}
export function StatusLabel({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' }) {
  return <span className={`ws-status ws-status-${tone}`}>{children}</span>
}
export function QueueSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="ws-queue"><div className="ws-section-heading"><h2>{title}</h2>{action}</div>{children}</section>
}

export function Field({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`ws-field ${className}`}>{label}{children}</label>
}
export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ws-select ${className}`} {...props} />
}
/**
 * Views of one page (not separate pages: those are links with aria-current). Only the selected tab is a Tab
 * stop; arrows move between tabs. Wrap the switched content in <TabPanel label={label} active={active}>.
 */
export function WorkspaceTabs({ label, items, active, disabled, onChange, counts, className = '' }: { label: string; items: { value: string; label: string }[]; active: string; disabled?: boolean; onChange: (value: string) => void; counts?: Record<string, ReactNode>; className?: string }) {
  return <div className={`production-tabs ws-pill-tabs ${className}`.trim()} role="tablist" aria-label={label} onKeyDown={tabKeys}><TabPill id={label} />{items.map(item => <button key={item.value} type="button" role="tab" id={tabId(label, item.value)} aria-selected={active === item.value} aria-controls={tabsPanelId(label)} tabIndex={active === item.value ? 0 : -1} disabled={disabled} onClick={() => onChange(item.value)}>{item.label}{counts?.[item.value] !== undefined && <span className="inventory-tab-count"><span className="ws-sr-only">, </span>{counts[item.value]}</span>}</button>)}</div>
}
export function TabPanel({ label, active, children, className = '' }: { label: string; active: string; children: ReactNode; className?: string }) {
  return <div role="tabpanel" id={tabsPanelId(label)} aria-labelledby={tabId(label, active)} className={className || undefined}>{children}</div>
}
export function TableRegion({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`ws-table-region ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>
}
export function DetailPanel({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <aside className={`ws-detail-panel ${className}`} aria-label={label}>{children}</aside>
}
