/** Period categories that auto-surface on cadence days. */
export const PERIOD_CATEGORIES = [
  'Weekly',
  'Monthly',
  'Quarterly',
  'Goal',
] as const

export type PeriodCategory = (typeof PERIOD_CATEGORIES)[number]

/** Per-task Weekly weekday (0=Sun…6=Sat) or Monthly day-of-month (1–28). */
export type CadenceOpts = {
  weekday?: number | null
  monthDay?: number | null
}

export const DEFAULT_WEEKDAY = 5 // Friday
export const DEFAULT_MONTH_DAY = 1

export function isPeriodCategory(category: string): category is PeriodCategory {
  return (PERIOD_CATEGORIES as readonly string[]).includes(category)
}

function parseLocalDate(dateISO: string): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = dateISO.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return { y, m, d, weekday: date.getDay() } // 0=Sun … 5=Fri
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysISO(dateISO: string, delta: number): string {
  const { y, m, d } = parseLocalDate(dateISO)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + delta)
  return formatLocalDate(date)
}

/** Max days to walk back to find the previous cadence day for a category. */
function lookbackDays(category: string): number {
  switch (category) {
    case 'Weekly':
      return 7
    case 'Monthly':
      return 31
    case 'Quarterly':
      return 92
    case 'Goal':
      return 366
    default:
      return 0
  }
}

function weeklyTarget(opts?: CadenceOpts | null): number {
  const w = opts?.weekday
  if (w != null && Number.isInteger(w) && w >= 0 && w <= 6) return w
  return DEFAULT_WEEKDAY
}

function monthlyTarget(opts?: CadenceOpts | null): number {
  const d = opts?.monthDay
  if (d != null && Number.isInteger(d) && d >= 1 && d <= 28) return d
  return DEFAULT_MONTH_DAY
}

/** Resolve DB cadence columns for a category (defaults on create / category change). */
export function resolveCadenceFields(
  category: string,
  weekday?: number | null,
  monthDay?: number | null,
): { cadenceWeekday: number | null; cadenceMonthDay: number | null; error?: string } {
  if (category === 'Weekly') {
    const w = weekday == null ? DEFAULT_WEEKDAY : Number(weekday)
    if (!Number.isInteger(w) || w < 0 || w > 6) {
      return {
        cadenceWeekday: null,
        cadenceMonthDay: null,
        error: 'cadenceWeekday must be an integer 0–6 (Sun–Sat)',
      }
    }
    return { cadenceWeekday: w, cadenceMonthDay: null }
  }
  if (category === 'Monthly') {
    const d = monthDay == null ? DEFAULT_MONTH_DAY : Number(monthDay)
    if (!Number.isInteger(d) || d < 1 || d > 28) {
      return {
        cadenceWeekday: null,
        cadenceMonthDay: null,
        error: 'cadenceMonthDay must be an integer 1–28',
      }
    }
    return { cadenceWeekday: null, cadenceMonthDay: d }
  }
  return { cadenceWeekday: null, cadenceMonthDay: null }
}

/** Build opts from a task row (null for non Weekly/Monthly). */
export function cadenceOptsFromRow(row: {
  category: string
  cadence_weekday?: number | null
  cadence_month_day?: number | null
}): CadenceOpts | null {
  if (row.category === 'Weekly') {
    return {
      weekday:
        row.cadence_weekday != null ? Number(row.cadence_weekday) : DEFAULT_WEEKDAY,
    }
  }
  if (row.category === 'Monthly') {
    return {
      monthDay:
        row.cadence_month_day != null
          ? Number(row.cadence_month_day)
          : DEFAULT_MONTH_DAY,
    }
  }
  return null
}

/** True when a period task should auto-appear on Today All for this calendar day. */
export function isCadenceDay(
  category: string,
  dateISO: string,
  opts?: CadenceOpts | null,
): boolean {
  const { m, d, weekday } = parseLocalDate(dateISO)
  switch (category) {
    case 'Weekly':
      return weekday === weeklyTarget(opts)
    case 'Monthly':
      return d === monthlyTarget(opts)
    case 'Quarterly':
      return d === 1 && (m === 1 || m === 4 || m === 7 || m === 10)
    case 'Goal':
      return d === 1 && m === 1
    default:
      return false
  }
}

/**
 * Most recent cadence day strictly before `dateISO`.
 * Overflow windows are capped to this → next cadence.
 */
export function previousCadenceDay(
  category: string,
  dateISO: string,
  opts?: CadenceOpts | null,
): string | null {
  if (!isPeriodCategory(category)) return null
  const max = lookbackDays(category)
  for (let i = 1; i <= max; i++) {
    const candidate = addDaysISO(dateISO, -i)
    if (isCadenceDay(category, candidate, opts)) return candidate
  }
  return null
}

/**
 * Today-list visibility for a master task.
 * - Period chip: always show that category.
 * - Projects chip: always show Projects (legacy Transactional = Projects).
 * - All / Daily: Daily (+ custom non-period) always;
 *   Projects only when `hasDayEntry` for that date (pulled via schedule / work);
 *   period only on cadence day, or capped overflow until occurrence completed.
 *
 * `occurrenceCompletedBeforeDate`: true when a completed day_entry exists in
 * `[previousCadenceDay, dateISO)` for this task (done earlier in this occurrence).
 * `createdDateISO`: task created calendar day (YYYY-MM-DD); tasks created after
 * the previous cadence are not overdue for that occurrence.
 * `opts`: per-task Weekly weekday / Monthly month-day (null → Friday / 1st).
 * `hasDayEntry`: true when a day_entries row exists for this task + dateISO.
 */
export function visibleOnToday(
  category: string,
  dateISO: string,
  occurrenceCompletedBeforeDate: boolean,
  filterCategory: string | null,
  createdDateISO?: string | null,
  opts?: CadenceOpts | null,
  hasDayEntry = false,
): boolean {
  const filter =
    filterCategory && filterCategory !== 'All' ? filterCategory : null

  if (filter && isPeriodCategory(filter)) {
    return category === filter
  }

  if (filter && category !== filter) {
    return false
  }

  if (category === 'Daily') {
    return true
  }

  if (category === 'Projects' || category === 'Transactional') {
    // Own chip: always. All: only when explicitly on the day.
    if (filter) return true
    return hasDayEntry
  }

  // Custom / unknown frequencies behave like always-on (Daily).
  if (!isPeriodCategory(category)) {
    return true
  }

  // Cadence day always surfaces (new occurrence).
  if (isCadenceDay(category, dateISO, opts)) {
    return true
  }

  // Capped overflow: prior cadence incomplete → show until done or next cadence.
  const prev = previousCadenceDay(category, dateISO, opts)
  if (!prev) return false
  // Not yet due for this occurrence (created after last cadence day).
  if (createdDateISO && createdDateISO > prev) return false
  if (occurrenceCompletedBeforeDate) return false
  return true
}
