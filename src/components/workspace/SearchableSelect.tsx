import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

// A filter dropdown whose menu starts with a search box, for lists that grow past a quick scan (clients, people).
// The empty value is the "all" choice and is always listed first, whatever the search.
export function SearchableSelect({ label, value, onChange, options, allLabel, placeholder = 'Search', className = '' }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][]; allLabel: string; placeholder?: string; className?: string }) {
  const id = useId(), [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), search = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const shown: [string, string][] = [['', allLabel], ...options.filter(([, name]) => !q || name.toLowerCase().includes(q))]
  const current = options.find(([v]) => v === value)?.[1] ?? allLabel
  const close = (refocus = true) => { setOpen(false); setQuery(''); if (refocus) trigger.current?.focus() }
  const choose = (next: string) => { onChange(next); close() }
  useEffect(() => {
    if (!open) return
    search.current?.focus()
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { document.getElementById(`${id}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' }) }, [active, id])
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = shown[active]; if (pick) choose(pick[0]) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') close(false)
  }
  return <div ref={root} className={`ws-field ws-combo ${className}`}>
    <span id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="ws-combo-trigger" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`} onClick={() => open ? close() : setOpen(true)} onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}>
      <span id={`${id}-value`} className="ws-combo-value">{current}</span>
    </button>
    {open && <div className="ws-combo-menu">
      <input ref={search} type="search" className="ws-combo-search" role="combobox" aria-label={`Search ${label.toLowerCase()}`} aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={`${id}-opt-${active}`} aria-autocomplete="list" placeholder={placeholder} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey} />
      <ul id={`${id}-list`} role="listbox" aria-label={label}>
        {shown.map(([v, name], i) => <li key={v || '__all'} id={`${id}-opt-${i}`} role="option" aria-selected={v === value} className={i === active ? 'is-active' : undefined} onPointerEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => choose(v)}>{name}</li>)}
        {shown.length === 1 && q && <li className="ws-combo-empty" role="presentation">No matches</li>}
      </ul>
    </div>}
  </div>
}
