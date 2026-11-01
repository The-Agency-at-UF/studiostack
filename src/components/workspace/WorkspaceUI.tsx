import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function PageHeader({ title, context, description, actions }: { title: string; context?: string; description?: string; actions?: ReactNode }) {
  return <header className="ws-page-header"><div>{context && <p className="ws-context">{context}</p>}<h1>{title}</h1>{description && <p className="ws-description">{description}</p>}</div>{actions && <div className="ws-actions">{actions}</div>}</header>
}
export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button type="button" className={`ws-button ws-button-${variant} ${className}`} {...props} />
}
export function Notice({ children, kind = 'info', ...props }: HTMLAttributes<HTMLDivElement> & { kind?: 'info' | 'error' | 'success' }) {
  return <div className={`ws-notice ws-notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'} {...props}>{children}</div>
}
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="ws-empty"><p>{title}</p>{children && <div>{children}</div>}</div>
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
export function WorkspaceTabs({ label, items, active, disabled, onChange }: { label: string; items: { value: string; label: string }[]; active: string; disabled?: boolean; onChange: (value: string) => void }) {
  return <nav className="production-tabs" aria-label={label}>{items.map(item => <button key={item.value} disabled={disabled} aria-current={active === item.value ? 'page' : undefined} onClick={() => onChange(item.value)}>{item.label}</button>)}</nav>
}
export function TableRegion({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`ws-table-region ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>
}
export function DetailPanel({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <aside className={`ws-detail-panel ${className}`} aria-label={label}>{children}</aside>
}
