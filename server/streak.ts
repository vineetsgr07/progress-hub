export const STREAK_LOOKBACK_DAYS = 90

function shiftISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(y, m - 1, d)
  next.setDate(next.getDate() + days)
  const yy = next.getFullYear()
  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Normalize Postgres DATE / timestamptz / text into YYYY-MM-DD. */
export function isoDateKey(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const text = String(value ?? '')
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : text.slice(0, 10)
}

export function streakWindowStart(endDate: string, maxDays = STREAK_LOOKBACK_DAYS): string {
  return shiftISODate(endDate, -(maxDays - 1))
}

/**
 * Consecutive days ending at `endDate` where SUM(completed) > 0.
 * A missing date breaks the streak (same as the previous per-day query).
 */
export function streakFromDayTotals(
  endDate: string,
  totals: Iterable<{ date: unknown; c: unknown }>,
  maxDays = STREAK_LOOKBACK_DAYS,
): number {
  const byDate = new Map<string, number>()
  for (const row of totals) {
    byDate.set(isoDateKey(row.date), Number(row.c) || 0)
  }
  let streak = 0
  let cursor = endDate
  for (let i = 0; i < maxDays; i++) {
    if ((byDate.get(cursor) ?? 0) <= 0) break
    streak += 1
    cursor = shiftISODate(cursor, -1)
  }
  return streak
}
