export function reservationLocalTime(iso: string) {
  const date = new Date(iso)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Resolves a local minute to each possible instant, preserving a saved instant when unchanged. */
export function reservationInstants(value: string, saved?: string) {
  if (saved && reservationLocalTime(saved) === value) return [saved]
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return []
  const utc = Date.parse(value + 'Z')
  if (!Number.isFinite(utc)) return []
  const day = 86_400_000
  const offsets = new Set([-day, 0, day].map(delta => new Date(utc + delta).getTimezoneOffset()))
  return [...offsets]
    .map(offset => new Date(utc + offset * 60_000).toISOString())
    .filter(instant => reservationLocalTime(instant) === value)
    .sort()
}
