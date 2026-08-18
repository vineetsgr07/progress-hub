import {
  cadenceOptsFromRow,
  isPeriodCategory,
  previousCadenceDay,
  visibleOnToday,
} from './cadence.js'
import { db } from './db.js'
import { isoDateKey } from './streak.js'

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

/** Goal cadence lookback is the longest (366 days). */
const CADENCE_LOOKBACK_DAYS = 366

type MasterTaskRow = {
  id: string
  category: string
  created_at: string
  cadence_weekday: number | null
  cadence_month_day: number | null
}

type DayEntryLite = {
  task_id: string
  date: string
  completed: number
  hours: number
  timer_started_at: string | null
}

function entryKey(taskId: string, date: string) {
  return `${taskId}:${date}`
}

function hasCompletedInWindow(
  dates: ReadonlySet<string> | undefined,
  startInclusive: string,
  endExclusive: string,
): boolean {
  if (!dates) return false
  for (const date of dates) {
    if (date >= startInclusive && date < endExclusive) return true
  }
  return false
}

function progressForDate(
  date: string,
  tasks: MasterTaskRow[],
  entryByKey: Map<string, DayEntryLite>,
  completedByTask: Map<string, Set<string>>,
  today: string,
): DayProgress {
  const rows: Array<MasterTaskRow & DayEntryLite> = []
  for (const row of tasks) {
    const createdDateISO = String(row.created_at || '').slice(0, 10)
    const opts = cadenceOptsFromRow(row)
    const prev = previousCadenceDay(row.category, date, opts)
    const occurrenceCompletedBeforeDate = prev
      ? hasCompletedInWindow(completedByTask.get(row.id), prev, date)
      : false
    const entry = entryByKey.get(entryKey(row.id, date))
    const hasDayEntry = entry != null
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
      rows.push({
        ...row,
        task_id: entry?.task_id ?? row.id,
        date,
        completed: Number(entry?.completed ?? 0),
        hours: Number(entry?.hours ?? 0),
        timer_started_at: entry?.timer_started_at ?? null,
      })
    }
  }

  const includeLiveTimer = date === today
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

/**
 * Cadence-honest Today-All progress for many calendar days.
 * Day rows are only fetched for the requested dates; period overflow uses a
 * completed-only lookback for Weekly/Monthly/Quarterly/Goal tasks.
 */
export async function computeDaysProgress(dates: string[]): Promise<DayProgress[]> {
  if (dates.length === 0) return []
  const unique = [...new Set(dates)]
  const minDate = unique.reduce((a, b) => (a < b ? a : b))
  const maxDate = unique.reduce((a, b) => (a > b ? a : b))
  const today = todayISO()

  const taskRows = (await db
    .prepare(
      `SELECT id, category, created_at, cadence_weekday, cadence_month_day
       FROM tasks
       WHERE is_master = 1`,
    )
    .all()) as MasterTaskRow[]

  const tasks = taskRows.map((row) => ({
    ...row,
    id: String(row.id),
    category: String(row.category),
    created_at: String(row.created_at ?? ''),
  }))

  const datePlaceholders = unique.map(() => '?').join(',')
  const entryRows = (await db
    .prepare(
      `SELECT task_id, date, completed, hours, timer_started_at
       FROM day_entries
       WHERE date IN (${datePlaceholders})`,
    )
    .all(...unique)) as DayEntryLite[]

  const periodIds = tasks
    .filter((row) => isPeriodCategory(row.category))
    .map((row) => row.id)
  let completedRows: Array<{ task_id: string; date: unknown }> = []
  if (periodIds.length > 0) {
    const lookbackStart = shiftISODate(minDate, -CADENCE_LOOKBACK_DAYS)
    const idPlaceholders = periodIds.map(() => '?').join(',')
    completedRows = (await db
      .prepare(
        `SELECT task_id, date FROM day_entries
         WHERE completed = 1 AND task_id IN (${idPlaceholders})
           AND date >= ? AND date < ?`,
      )
      .all(...periodIds, lookbackStart, maxDate)) as Array<{
      task_id: string
      date: unknown
    }>
  }

  const entryByKey = new Map<string, DayEntryLite>()
  const completedByTask = new Map<string, Set<string>>()
  for (const row of entryRows) {
    const date = isoDateKey(row.date)
    const taskId = String(row.task_id)
    const normalized: DayEntryLite = {
      task_id: taskId,
      date,
      completed: Number(row.completed ?? 0),
      hours: Number(row.hours ?? 0),
      timer_started_at: row.timer_started_at ?? null,
    }
    entryByKey.set(entryKey(taskId, date), normalized)
    if (normalized.completed > 0) {
      const set = completedByTask.get(taskId) ?? new Set<string>()
      set.add(date)
      completedByTask.set(taskId, set)
    }
  }
  for (const row of completedRows) {
    const taskId = String(row.task_id)
    const set = completedByTask.get(taskId) ?? new Set<string>()
    set.add(isoDateKey(row.date))
    completedByTask.set(taskId, set)
  }

  return dates.map((date) =>
    progressForDate(date, tasks, entryByKey, completedByTask, today),
  )
}

/**
 * Cadence-honest Today-All progress for one calendar day.
 * Live timers only contribute when `date` is the real local today.
 */
export async function computeDayProgress(date: string): Promise<DayProgress> {
  const [day] = await computeDaysProgress([date])
  return day
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
export async function loadWeekBundle(anchorDate: string): Promise<{
  week: WeekProgress
  day: DayProgress
}> {
  const today = todayISO()
  const weekStart = startOfIsoWeek(anchorDate)
  const weekEnd = shiftISODate(weekStart, 6)
  const prevStart = shiftISODate(weekStart, -7)
  const currentDates = Array.from({ length: 7 }, (_, j) => shiftISODate(weekStart, j))
  const prevDates = Array.from({ length: 7 }, (_, j) => shiftISODate(prevStart, j))
  const allDates = [...currentDates, ...prevDates]
  const progress = await computeDaysProgress(allDates)
  const goalRows = (await db
    .prepare(
      `SELECT date, goal FROM daily_goals
       WHERE date >= ? AND date <= ?`,
    )
    .all(weekStart, weekEnd)) as Array<{ date: string; goal: string }>
  const currentProgress = progress.slice(0, 7)
  const prevDays = progress.slice(7)
  const goalsByDate = new Map(
    goalRows.map((r) => [isoDateKey(r.date), String(r.goal ?? '')]),
  )

  const days: WeekDayPoint[] = currentDates.map((d, j) => {
    const day = currentProgress[j]
    return {
      date: d,
      label: weekdayShort(d).slice(0, 3),
      dayOfMonth: parseLocalDate(d).getDate(),
      completed: day.completed,
      total: day.total,
      percent: day.percent,
      hours: day.hours,
      isToday: d === today,
      isFuture: d > today,
      goal: goalsByDate.get(d) ?? '',
    }
  })

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

  const previous = aggregateDays(prevDays)
  const dayIndex = allDates.indexOf(anchorDate)
  return {
    week: {
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
    },
    day: dayIndex >= 0 ? progress[dayIndex] : progress[0],
  }
}

export async function buildWeekProgress(anchorDate: string): Promise<WeekProgress> {
  const { week } = await loadWeekBundle(anchorDate)
  return week
}

export async function buildProgressSeries(
  anchorDate: string,
  range: ProgressRange,
): Promise<ProgressPoint[]> {
  if (range === 'day') {
    const dates = Array.from({ length: 14 }, (_, i) => shiftISODate(anchorDate, i - 13))
    const days = await computeDaysProgress(dates)
    return dates.map((d, i) => {
      const day = days[i]
      return {
        key: d,
        label: weekdayShort(d),
        completed: day.completed,
        total: day.total,
        hours: day.hours,
        percent: day.percent,
      }
    })
  }

  if (range === 'week') {
    const currentWeekStart = startOfIsoWeek(anchorDate)
    const weekStarts = Array.from({ length: 8 }, (_, i) =>
      shiftISODate(currentWeekStart, (i - 7) * 7),
    )
    const dates = weekStarts.flatMap((weekStart) =>
      Array.from({ length: 7 }, (_, j) => shiftISODate(weekStart, j)),
    )
    const days = await computeDaysProgress(dates)
    return weekStarts.map((weekStart, i) => {
      const slice = days.slice(i * 7, i * 7 + 7)
      return {
        key: weekStart,
        label: `${monthShort(weekStart)} ${parseLocalDate(weekStart).getDate()}`,
        ...aggregateDays(slice),
      }
    })
  }

  const currentMonthStart = startOfMonth(anchorDate)
  const months = Array.from({ length: 6 }, (_, i) =>
    startOfMonth(shiftMonths(currentMonthStart, i - 5)),
  )
  const dates = months.flatMap((monthStart) => {
    const len = daysInMonth(monthStart)
    return Array.from({ length: len }, (_, j) => shiftISODate(monthStart, j))
  })
  const days = await computeDaysProgress(dates)
  let offset = 0
  return months.map((monthStart) => {
    const len = daysInMonth(monthStart)
    const slice = days.slice(offset, offset + len)
    offset += len
    return {
      key: monthStart.slice(0, 7),
      label: monthShort(monthStart),
      ...aggregateDays(slice),
    }
  })
}
