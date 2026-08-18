/** Local calendar date YYYY-MM-DD (avoids UTC off-by-one). */
export function localISODate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(y, m - 1, d)
  next.setDate(next.getDate() + days)
  return localISODate(next)
}

export function formatDuration(hours: number): string {
  const totalSec = Math.max(0, Math.floor(hours * 3600))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatHoursShort(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(hours >= 10 ? 1 : 2)
}
