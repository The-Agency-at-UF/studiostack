import type { KeyboardEvent } from 'react'

/** Ids that tie a tab to its panel: pass `tabsPanelId(label)` as the id of the content the tabs switch. */
export const tabsPanelId = (label: string) => `tabs-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-panel`
export const tabId = (label: string, value: string) => `${tabsPanelId(label)}-${value}`
/** Arrow keys, Home and End move between tabs (and select them), as the ARIA tabs pattern expects. */
export function tabKeys(event: KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role=tab]:not(:disabled)'))
  const at = tabs.indexOf(document.activeElement as HTMLElement)
  if (at < 0) return
  // A vertical list (which may lay out as a row on phones) also answers Up and Down.
  const vertical = event.currentTarget.getAttribute('aria-orientation') === 'vertical'
  const forward = event.key === 'ArrowRight' || (vertical && event.key === 'ArrowDown'), back = event.key === 'ArrowLeft' || (vertical && event.key === 'ArrowUp')
  const next = forward ? (at + 1) % tabs.length : back ? (at - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
  if (next < 0) return
  event.preventDefault(); tabs[next].focus(); tabs[next].click()
}
/** Props for an element that is the panel of a WorkspaceTabs bar, when it can't be wrapped in TabPanel. */
export const tabPanelProps = (label: string, active: string) => ({ role: 'tabpanel' as const, id: tabsPanelId(label), 'aria-labelledby': tabId(label, active) })
