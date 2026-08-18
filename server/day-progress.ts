import {
  cadenceOptsFromRow,
  previousCadenceDay,
  visibleOnToday,
} from './cadence.js'
import { db } from './db.js'

export type DayProgress = {
  date: string
  completed: number
  total: number
  hours: number
  percent: number
  taskIds: string[]
}

export type ProgressRange = 'day' | 'week' | 'month'

export type ProgressPoint = {
  key: string
  label: string
  completed: number
  total: number
  hours: number
  percent: number
}

const RANGES: readonly ProgressRange[] = ['day', 'week', 'month'] as const

export function isProgressRange(value: string): value is ProgressRange {
  return (RANGES as readonly string[]).includes(value)
}

function parseLocalDate(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function shiftISODate(iso: string, days: number): string {
  const date = parseLocalDate(iso)
  date.setDate(date.getDate() + days)
  return formatLocalDate(date)
}

function todayISO(): string {
  return formatLocalDate(new Date())
}

/** Monday-based ISO week start for a local calendar day. */
function startOfIsoWeek(dateISO: string): string {
  const date = parseLocalDate(dateISO)
  const day = date.getDay() // 0=Sun … 6=Sat
  const delta = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + delta)
  return formatLocalDate(date)
}

function startOfMonth(dateISO: string): string {
  const date = parseLocalDate(dateISO)
  date.setDate(1)
  return formatLocalDate(date)
}

function shiftMonths(dateISO: string, months: number): string {
  const date = parseLocalDate(dateISO)
  date.setMonth(date.getMonth() + months)
  return formatLocalDate(date)
}

function daysInMonth(dateISO: string): number {
  const date = parseLocalDate(dateISO)
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

function weekdayShort(dateISO: string): string {
  return parseLocalDate(dateISO).toLocaleDateString('en-US', { weekday: 'short' })
}

function monthShort(dateISO: string): string {
  return parseLocalDate(dateISO).toLocaleDateString('en-US', { month: 'short' })
}

function aggregateDays(days: DayProgress[]): Omit<ProgressPoint, 'key' | 'label'> {
  let completed = 0
  let total = 0
  let hours = 0
  for (const day of days) {
    if (day.total <= 0) continue
    completed += day.completed
    total += day.total
    hours += day.hours
  }
  return {
    completed,
    total,
    hours: Math.round(hours * 100) / 100,
    percent: total ? Math.round((completed / total) * 100) : 0,
  }
}

/**
 * Cadence-honest Today-All progress for one calendar day.
 * Live timers only contribute when `date` is the real local today.
 */
export async function computeDayProgress(date: string): Promise<DayProgress> {
  const candidates = await db
    .prepare(
      `SELECT t.id, t.category, t.created_at, t.cadence_weekday, t.cadence_month_day,
              COALESCE(d.completed, 0) AS completed,
              COALESCE(d.hours, 0) AS hours, d.timer_started_at,
              d.task_id AS entry_task_id
       FROM tasks t
       LEFT JOIN day_entries d ON d.task_id = t.id AND d.date = ?
       WHERE t.is_master = 1`,
    )
    .all(date) as Array<{
    id: string
    category: string
    created_at: string
    cadence_weekday: number | null
    cadence_month_day: number | null
    completed: number
    hours: number
    timer_started_at: string | null
    entry_task_id: string | null
  }>

  const completedBeforeStmt = await db.prepare(
    `SELECT 1 AS ok FROM day_entries
     WHERE task_id = ? AND completed = 1 AND date >= ? AND date < ?
     LIMIT 1`,
  )

  const rows: typeof candidates = []
  for (const row of candidates) {
    const createdDateISO = String(row.created_at || '').slice(0, 10)
    const opts = cadenceOptsFromRow(row)
    const prev = previousCadenceDay(row.category, date, opts)
    const occurrenceCompletedBeforeDate = prev
      ? Boolean(await completedBeforeStmt.get(row.id, prev, date))
      : false
    const hasDayEntry = row.entry_task_id != null
    if (
      visibleOnToday(
        row.category,
        date,
        occurrenceCompletedBeforeDate,
        null,
        createdDateISO || null,
        opts,
        hasDayEntry,
      )
    ) {
      rows.push(row)
    }
  }

  const includeLiveTimer = date === todayISO()
  let hours = 0
  let completed = 0
  for (const row of rows) {
    let h = Number(row.hours)
    if (includeLiveTimer && row.timer_started_at) {
      h += (Date.now() - new Date(row.timer_started_at).getTime()) / 3_600_000
    }
    hours += h
    if (row.completed) completed += 1
  }

  const total = rows.length
  return {
    date,
    completed,
    total,
    hours: Math.round(hours * 100) / 100,
    percent: total ? Math.round((completed / total) * 100) : 0,
    taskIds: rows.map((r) => r.id),
  }
}

export type WeekDayPoint = {
  date: string
  label: string
  dayOfMonth: number
  completed: number
  total: number
  percent: number
  hours: number
  isToday: boolean
  isFuture: boolean
  /** Day goal saved for this calendar date (empty if none). */
  goal: string
}

export type WeekProgress = {
  weekStart: string
  weekEnd: string
  days: WeekDayPoint[]
  summary: {
    completed: number
    total: number
    percent: number
    hours: number
    activeDays: number
    bestDate: string | null
  }
  previous: {
    completed: number
    total: number
    percent: number
  }
}

/** Mon–Sun week around anchorDate, plus previous-week summary for delta. */
export async function buildWeekProgress(anchorDate: string): Promise<WeekProgress> {
  const today = todayISO()
  const weekStart = startOfIsoWeek(anchorDate)
  const weekEnd = shiftISODate(weekStart, 6)

  const days: WeekDayPoint[] = []
  for (let j = 0; j < 7; j += 1) {
    const d = shiftISODate(weekStart, j)
    const day = await computeDayProgress(d)
    days.push({
      date: d,
      label: weekdayShort(d).slice(0, 3),
      dayOfMonth: parseLocalDate(d).getDate(),
      completed: day.completed,
      total: day.total,
      percent: day.percent,
      hours: day.hours,
      isToday: d === today,
      isFuture: d > today,
      goal: '',
    })
  }

  const goalRows = await db
    .prepare(
      `SELECT date, goal FROM daily_goals
       WHERE date >= ? AND date <= ?`,
    )
    .all(weekStart, weekEnd) as Array<{ date: string; goal: string }>
  const goalsByDate = new Map(
    goalRows.map((r) => [String(r.date), String(r.goal ?? '')]),
  )
  for (const day of days) {
    day.goal = goalsByDate.get(day.date) ?? ''
  }

  const summaryAgg = aggregateDays(
    days.map((d) => ({
      date: d.date,
      completed: d.completed,
      total: d.total,
      hours: d.hours,
      percent: d.percent,
      taskIds: [],
    })),
  )

  let bestDate: string | null = null
  let bestPercent = -1
  let activeDays = 0
  for (const d of days) {
    if (d.total > 0) activeDays += 1
    if (d.total > 0 && d.percent > bestPercent) {
      bestPercent = d.percent
      bestDate = d.date
    }
  }

  const prevStart = shiftISODate(weekStart, -7)
  const prevDays: DayProgress[] = []
  for (let j = 0; j < 7; j += 1) {
    prevDays.push(await computeDayProgress(shiftISODate(prevStart, j)))
  }
  const previous = aggregateDays(prevDays)

  return {
    weekStart,
    weekEnd,
    days,
    summary: {
      ...summaryAgg,
      activeDays,
      bestDate,
    },
    previous: {
      completed: previous.completed,
      total: previous.total,
      percent: previous.percent,
    },
  }
}

export async function buildProgressSeries(
  anchorDate: string,
  range: ProgressRange,
): Promise<ProgressPoint[]> {
  if (range === 'day') {
    const points: ProgressPoint[] = []
    for (let i = 0; i < 14; i += 1) {
      const d = shiftISODate(anchorDate, i - 13)
      const day = await computeDayProgress(d)
      points.push({
        key: d,
        label: weekdayShort(d),
        completed: day.completed,
        total: day.total,
        hours: day.hours,
        percent: day.percent,
      })
    }
    return points
  }

  if (range === 'week') {
    const currentWeekStart = startOfIsoWeek(anchorDate)
    const points: ProgressPoint[] = []
    for (let i = 0; i < 8; i += 1) {
      const weekStart = shiftISODate(currentWeekStart, (i - 7) * 7)
      const days: DayProgress[] = []
      for (let j = 0; j < 7; j += 1) {
        days.push(await computeDayProgress(shiftISODate(weekStart, j)))
      }
      const agg = aggregateDays(days)
      points.push({
        key: weekStart,
        label: `${monthShort(weekStart)} ${parseLocalDate(weekStart).getDate()}`,
        ...agg,
      })
    }
    return points
  }

  const currentMonthStart = startOfMonth(anchorDate)
  const points: ProgressPoint[] = []
  for (let i = 0; i < 6; i += 1) {
    const monthStart = startOfMonth(shiftMonths(currentMonthStart, i - 5))
    const len = daysInMonth(monthStart)
    const days: DayProgress[] = []
    for (let j = 0; j < len; j += 1) {
      days.push(await computeDayProgress(shiftISODate(monthStart, j)))
    }
    const agg = aggregateDays(days)
    points.push({
      key: monthStart.slice(0, 7),
      label: monthShort(monthStart),
      ...agg,
    })
  }
  return points
}
