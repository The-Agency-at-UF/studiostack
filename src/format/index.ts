/**
 * One way to show dates, times, counts and stored values across StudioStack.
 * Date-times include the reader's local time zone abbreviation only where a time is shown.
 */
const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear()

/** "Fri, Nov 20, 10:00 AM" (adds the year when it is not this year). */
export const dateTimeLabel = (value: string | number | Date) => {
  const d = new Date(value)
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear(d) ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' })
}

/** "Nov 20, 2026". Pass utc for calendar dates stored as YYYY-MM-DD so they never shift a day. */
export const dateLabel = (value: string | number | Date | null | undefined, { utc = false, fallback = 'Not scheduled' }: { utc?: boolean; fallback?: string } = {}) => {
  if (value === null || value === undefined || value === '') return fallback
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric', ...(utc || (typeof value === 'string' && value.length === 10) ? { timeZone: 'UTC' } : {}) })
}

/** The reader's own calendar day as YYYY-MM-DD, matching what <input type="date"> shows. */
export const localToday = (now: Date = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

/** The short name of the reader's time zone, e.g. "EST". */
export const timeZoneLabel = (now: Date = new Date()) => new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value ?? ''

/** Turns stored values such as "high" or "in_progress" into "High" and "In progress". */
export const titleCase = (value: string | null | undefined) => { if (!value) return ''; const text = value.replace(/_/g, ' '); return text.charAt(0).toUpperCase() + text.slice(1) }

/** 1234567 → "1,234,567". */
export const countLabel = (value: number) => value.toLocaleString()

/** 20480 → "20 KB"; 21000000 → "21 MB". */
export const bytesLabel = (bytes: number) => {
  const mb = bytes >= 1_000_000
  return new Intl.NumberFormat([], { style: 'unit', unit: mb ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(mb ? bytes / 1_000_000 : Math.max(1, Math.ceil(bytes / 1000)))
}

/** Labels for stored status values that users see. Anything not listed falls back to titleCase. */
const labels: Record<string, string> = {
  // Brief history and decisions
  submitted: 'Submitted for review', approved: 'Approved', changes_requested: 'Changes requested', denied: 'Denied', withdrawn: 'Withdrawn', scheduled: 'Dates updated', comment: 'Comment', created: 'Created', updated: 'Updated', draft: 'Draft',
  // Email delivery
  pending: 'Queued', sending: 'Sending', sent: 'Sent', failed: 'Failed', uncertain: 'May have sent',
  // Equipment
  in_progress: 'In progress', checked_out: 'Checked out', out_of_service: 'Out of service',
}
export const statusLabel = (value: string | null | undefined) => value ? labels[value] ?? titleCase(value) : ''

/** Organization roles as people read them. */
export const roleLabel = (role: string) => ({ owner: 'Owner', admin: 'Admin', member: 'Member', client: 'Client' } as Record<string, string>)[role] ?? titleCase(role)
