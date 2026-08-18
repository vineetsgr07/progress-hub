import { db } from './db.js'

export type HabitDayCell = {
  date: string
  completed: boolean
  /** Habit existed on this day (created on or before). */
  tracked: boolean
}

export type HabitProgressRow = {
  id: string
  title: string
  archived: boolean
  createdAt: string
  completedDays: number
  trackedDays: number
  percent: number
  /** Consecutive completed days ending at range end (today). */
  streak: number
  cells: HabitDayCell[]
}

export type HabitsDailySummary = {
  date: string
  completed: number
  total: number
  percent: number
}

export type HabitsProgress = {
  startDate: string
  endDate: string
  days: number
  habits: HabitProgressRow[]
  daily: HabitsDailySummary[]
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

/** Habit creation day in local calendar (not raw UTC slice). */
function createdLocalDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso || '').slice(0, 10)
  return formatLocalDate(d)
}

function clampDays(raw: number): number {
  if (!Number.isFinite(raw)) return 28
  return Math.min(90, Math.max(7, Math.floor(raw)))
}

/** Current streak of completed days ending at endDate (walking backward). */
export function habitStreakFromCells(
  cells: HabitDayCell[],
  endDate: string,
): number {
  const byDate = new Map(cells.map((c) => [c.date, c]))
  let streak = 0
  let cursor = endDate
  for (let i = 0; i < cells.length + 1; i += 1) {
    const cell = byDate.get(cursor)
    if (!cell || !cell.tracked) break
    if (!cell.completed) break
    streak += 1
    cursor = shiftISODate(cursor, -1)
  }
  return streak
}

/**
 * Habit history for the last N calendar days (inclusive of today).
 * Past check-ins stay in habit_entries; a new day with no entry = unchecked.
 */
export async function buildHabitsProgress(
  daysRaw = 28,
  endDate = todayISO(),
): Promise<HabitsProgress> {
  const days = clampDays(daysRaw)
  const startDate = shiftISODate(endDate, -(days - 1))
  const dateList = Array.from({ length: days }, (_, i) =>
    shiftISODate(startDate, i),
  )

  const habits = await db
    .prepare(
      `SELECT * FROM habits
       WHERE archived = 0
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all() as Array<Record<string, unknown>>

  const entries = await db
    .prepare(
      `SELECT habit_id, date, completed FROM habit_entries
       WHERE date >= ? AND date <= ?`,
    )
    .all(startDate, endDate) as Array<{
    habit_id: string
    date: string
    completed: number
  }>

  const entryMap = new Map<string, boolean>()
  for (const e of entries) {
    entryMap.set(`${e.habit_id}:${e.date}`, Boolean(e.completed))
  }

  const rows: HabitProgressRow[] = habits.map((row) => {
    const id = String(row.id)
    const createdDate = createdLocalDate(String(row.created_at || ''))
    const cells: HabitDayCell[] = dateList.map((date) => {
      const tracked = !createdDate || createdDate <= date
      const completed = tracked ? Boolean(entryMap.get(`${id}:${date}`)) : false
      return { date, completed, tracked }
    })
    let completedDays = 0
    let trackedDays = 0
    for (const c of cells) {
      if (!c.tracked) continue
      trackedDays += 1
      if (c.completed) completedDays += 1
    }
    return {
      id,
      title: String(row.title ?? ''),
      archived: Boolean(row.archived),
      createdAt: String(row.created_at),
      completedDays,
      trackedDays,
      percent: trackedDays
        ? Math.round((completedDays / trackedDays) * 100)
        : 0,
      streak: habitStreakFromCells(cells, endDate),
      cells,
    }
  })

  const daily: HabitsDailySummary[] = dateList.map((date) => {
    let completed = 0
    let total = 0
    for (const habit of rows) {
      const cell = habit.cells.find((c) => c.date === date)
      if (!cell?.tracked) continue
      total += 1
      if (cell.completed) completed += 1
    }
    return {
      date,
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
    }
  })

  return {
    startDate,
    endDate,
    days,
    habits: rows,
    daily,
  }
}
