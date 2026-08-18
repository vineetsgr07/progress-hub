import { db } from './db.js'
import { computeDaysProgress } from './day-progress.js'
import { buildHabitsProgress } from './habits-history.js'

export const DEFAULT_WORK_TARGET_HOURS = 12
export const DEFAULT_HABIT_BUDGET_HOURS = 3

export type HoursBreakdownRow = {
  key: string
  hours: number
  count: number
  done: number
  /** Share of timer hours in the current range (0–100). */
  sharePercent: number
  /** Hours for this key in the previous equal-length window. */
  priorHours: number
}

export type UnfinishedDailyInsight = {
  taskId: string
  title: string
  todayHours: number
  totalHours: number
  priorIncompleteDays: number
}

export type BudgetDayPoint = {
  date: string
  label: string
  workHours: number
  workTarget: number
  /** Habit budget hours from check-ins: (done/total) × habitTarget — not a timer. */
  habitBudgetHours: number
  habitTarget: number
  habitCompleted: number
  habitTotal: number
  totalHours: number
  totalTarget: number
  workPercent: number
  habitPercent: number
  totalPercent: number
}

export type AnalyticsGoals = {
  workTargetHours: number
  habitBudgetHours: number
  totalTargetHours: number
}

export type AnalyticsInsight = {
  rangeStart: string
  rangeEnd: string
  hoursByCategory: HoursBreakdownRow[]
  hoursByProject: HoursBreakdownRow[]
  unfinishedDaily: UnfinishedDailyInsight[]
  unfinishedDailyTotalHours: number
  goals: AnalyticsGoals
  todayBudget: BudgetDayPoint
  budgetSeries: BudgetDayPoint[]
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

/** Inclusive start of an N-day window ending on `endISO`. */
export function rangeStartISO(endISO: string, dayCount: number): string {
  const date = parseLocalDate(endISO)
  date.setDate(date.getDate() - (dayCount - 1))
  return formatLocalDate(date)
}

/** Calendar day before `dateISO` (local). */
export function dayBeforeISO(dateISO: string): string {
  const date = parseLocalDate(dateISO)
  date.setDate(date.getDate() - 1)
  return formatLocalDate(date)
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100
}

function weekdayShort(dateISO: string): string {
  return parseLocalDate(dateISO).toLocaleDateString('en-US', { weekday: 'short' })
}

export function resolveAnalyticsGoals(
  workTarget = DEFAULT_WORK_TARGET_HOURS,
  habitTarget = DEFAULT_HABIT_BUDGET_HOURS,
): AnalyticsGoals {
  const work = workTarget > 0 ? workTarget : DEFAULT_WORK_TARGET_HOURS
  const habit = habitTarget > 0 ? habitTarget : DEFAULT_HABIT_BUDGET_HOURS
  return {
    workTargetHours: work,
    habitBudgetHours: habit,
    totalTargetHours: roundHours(work + habit),
  }
}

/**
 * Habit budget hours from check-in completion (not logged timer time).
 * 100% check-ins → full habitTarget; no habits tracked → 0.
 */
export function habitBudgetFromCompletion(
  completed: number,
  total: number,
  habitTarget: number,
): number {
  if (total <= 0 || habitTarget <= 0) return 0
  const ratio = Math.max(0, Math.min(1, completed / total))
  return roundHours(ratio * habitTarget)
}

export function buildBudgetDayPoint(
  date: string,
  workHours: number,
  habitCompleted: number,
  habitTotal: number,
  goals: AnalyticsGoals,
): BudgetDayPoint {
  const work = roundHours(Math.max(0, workHours))
  const habitBudgetHours = habitBudgetFromCompletion(
    habitCompleted,
    habitTotal,
    goals.habitBudgetHours,
  )
  const totalHours = roundHours(work + habitBudgetHours)
  return {
    date,
    label: weekdayShort(date),
    workHours: work,
    workTarget: goals.workTargetHours,
    habitBudgetHours,
    habitTarget: goals.habitBudgetHours,
    habitCompleted,
    habitTotal,
    totalHours,
    totalTarget: goals.totalTargetHours,
    workPercent: goals.workTargetHours
      ? Math.min(100, Math.round((work / goals.workTargetHours) * 100))
      : 0,
    habitPercent: goals.habitBudgetHours
      ? Math.min(
          100,
          Math.round((habitBudgetHours / goals.habitBudgetHours) * 100),
        )
      : 0,
    totalPercent: goals.totalTargetHours
      ? Math.min(100, Math.round((totalHours / goals.totalTargetHours) * 100))
      : 0,
  }
}

export async function buildBudgetSeries(
  endDate: string,
  dayCount = 14,
  goals: AnalyticsGoals = resolveAnalyticsGoals(),
): Promise<BudgetDayPoint[]> {
  const start = rangeStartISO(endDate, dayCount)
  const dates = Array.from({ length: dayCount }, (_, i) => {
    const date = parseLocalDate(start)
    date.setDate(date.getDate() + i)
    return formatLocalDate(date)
  })
  const [habits, days] = await Promise.all([
    buildHabitsProgress(dayCount, endDate),
    computeDaysProgress(dates),
  ])
  const byDate = new Map(habits.daily.map((d) => [d.date, d]))
  return dates.map((iso, i) => {
    const day = days[i]
    const habit = byDate.get(iso)
    return buildBudgetDayPoint(
      iso,
      day.hours,
      habit?.completed ?? 0,
      habit?.total ?? 0,
      goals,
    )
  })
}

/**
 * Hours logged per category in [rangeStart, rangeEnd], plus master done/count.
 * Hours stay on the calendar day they were worked — no roll-forward.
 */
export async function hoursByCategory(
  rangeStart: string,
  rangeEnd: string,
): Promise<HoursBreakdownRow[]> {
  const master = await db
    .prepare(
      `SELECT category AS key,
              COUNT(*) AS count,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
       FROM tasks
       WHERE is_master = 1
       GROUP BY category`,
    )
    .all() as Array<{ key: string; count: number; done: number }>

  const hoursRows = await db
    .prepare(
      `SELECT t.category AS key, COALESCE(SUM(d.hours), 0) AS hours
       FROM day_entries d
       JOIN tasks t ON t.id = d.task_id
       WHERE d.date >= ? AND d.date <= ?
       GROUP BY t.category`,
    )
    .all(rangeStart, rangeEnd) as Array<{ key: string; hours: number }>

  const hoursMap = new Map(hoursRows.map((r) => [r.key, Number(r.hours)]))
  const keys = new Set([...master.map((m) => m.key), ...hoursMap.keys()])

  return enrichHoursBreakdown(
    [...keys]
      .map((key) => {
        const m = master.find((row) => row.key === key)
        return {
          key,
          hours: roundHours(hoursMap.get(key) ?? 0),
          count: m ? Number(m.count) : 0,
          done: m ? Number(m.done) : 0,
          sharePercent: 0,
          priorHours: 0,
        }
      })
      .filter((row) => row.hours > 0 || row.count > 0)
      .sort((a, b) => b.hours - a.hours || b.count - a.count),
  )
}

/**
 * Hours logged per project tag in [rangeStart, rangeEnd], plus master done/count.
 */
export async function hoursByProject(
  rangeStart: string,
  rangeEnd: string,
): Promise<HoursBreakdownRow[]> {
  const master = await db
    .prepare(
      `SELECT project_tag AS key,
              COUNT(*) AS count,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
       FROM tasks
       WHERE is_master = 1
       GROUP BY project_tag`,
    )
    .all() as Array<{ key: string; count: number; done: number }>

  const hoursRows = await db
    .prepare(
      `SELECT t.project_tag AS key, COALESCE(SUM(d.hours), 0) AS hours
       FROM day_entries d
       JOIN tasks t ON t.id = d.task_id
       WHERE d.date >= ? AND d.date <= ?
       GROUP BY t.project_tag`,
    )
    .all(rangeStart, rangeEnd) as Array<{ key: string; hours: number }>

  const hoursMap = new Map(hoursRows.map((r) => [r.key, Number(r.hours)]))
  const keys = new Set([...master.map((m) => m.key), ...hoursMap.keys()])

  return enrichHoursBreakdown(
    [...keys]
      .map((key) => {
        const m = master.find((row) => row.key === key)
        return {
          key,
          hours: roundHours(hoursMap.get(key) ?? 0),
          count: m ? Number(m.count) : 0,
          done: m ? Number(m.done) : 0,
          sharePercent: 0,
          priorHours: 0,
        }
      })
      .filter((row) => row.hours > 0 || row.count > 0)
      .sort((a, b) => b.hours - a.hours || b.count - a.count),
  )
}

/** Attach share of current-range hours (priorHours filled later). */
export function enrichHoursBreakdown(
  rows: HoursBreakdownRow[],
): Promise<HoursBreakdownRow[]> {
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0)
  return rows.map((row) => ({
    ...row,
    sharePercent:
      totalHours > 0 && row.hours > 0
        ? Math.max(1, Math.round((row.hours / totalHours) * 100))
        : 0,
  }))
}

/** Merge prior-window hours onto current breakdown rows. */
export function applyPriorHours(
  current: HoursBreakdownRow[],
  prior: HoursBreakdownRow[],
): Promise<HoursBreakdownRow[]> {
  const priorMap = new Map(prior.map((row) => [row.key, row.hours]))
  return current.map((row) => ({
    ...row,
    priorHours: roundHours(priorMap.get(row.key) ?? 0),
  }))
}

/**
 * Daily tasks still incomplete on `date` that already have prior unfinished days
 * or prior logged hours — effort continuity without merging hours into today.
 */
export async function unfinishedDailyInsight(
  date: string,
  lookbackDays = 14,
): Promise<UnfinishedDailyInsight[]> {
  const start = rangeStartISO(date, lookbackDays)
  const rows = await db
    .prepare(
      `SELECT t.id AS "taskId",
              t.title AS title,
              COALESCE(today.hours, 0) AS "todayHours",
              COALESCE(SUM(d.hours), 0) AS "totalHours",
              SUM(
                CASE
                  WHEN d.date < ? AND COALESCE(d.completed, 0) = 0 THEN 1
                  ELSE 0
                END
              ) AS "priorIncompleteDays"
       FROM tasks t
       LEFT JOIN day_entries today
         ON today.task_id = t.id AND today.date = ?
       LEFT JOIN day_entries d
         ON d.task_id = t.id AND d.date >= ? AND d.date <= ?
       WHERE t.is_master = 1
         AND t.category = 'Daily'
         AND COALESCE(today.completed, 0) = 0
       GROUP BY t.id, t.title, today.hours
       HAVING COALESCE(SUM(d.hours), 0) > COALESCE(today.hours, 0)
           OR SUM(
                CASE
                  WHEN d.date < ? AND COALESCE(d.completed, 0) = 0 THEN 1
                  ELSE 0
                END
              ) >= 1
       ORDER BY "totalHours" DESC, "priorIncompleteDays" DESC
       LIMIT 5`,
    )
    .all(date, date, start, date, date) as Array<{
    taskId: string
    title: string
    todayHours: number
    totalHours: number
    priorIncompleteDays: number
  }>

  return rows.map((row) => ({
    taskId: String(row.taskId),
    title: String(row.title),
    todayHours: roundHours(Number(row.todayHours)),
    totalHours: roundHours(Number(row.totalHours)),
    priorIncompleteDays: Number(row.priorIncompleteDays),
  }))
}

export async function buildAnalyticsInsight(
  date: string,
  dayCount = 14,
): Promise<AnalyticsInsight> {
  const rangeEnd = date
  const rangeStart = rangeStartISO(date, dayCount)
  const priorEnd = dayBeforeISO(rangeStart)
  const priorStart = rangeStartISO(priorEnd, dayCount)
  const unfinishedDaily = await unfinishedDailyInsight(date, dayCount)
  const goals = resolveAnalyticsGoals()
  const budgetSeries = await buildBudgetSeries(date, dayCount, goals)
  const todayBudget =
    budgetSeries.find((p) => p.date === date) ??
    buildBudgetDayPoint(date, 0, 0, 0, goals)
  const categoryCurrent = await hoursByCategory(rangeStart, rangeEnd)
  const categoryPrior = await hoursByCategory(priorStart, priorEnd)
  const projectCurrent = await hoursByProject(rangeStart, rangeEnd)
  const projectPrior = await hoursByProject(priorStart, priorEnd)
  return {
    rangeStart,
    rangeEnd,
    hoursByCategory: applyPriorHours(categoryCurrent, categoryPrior),
    hoursByProject: applyPriorHours(projectCurrent, projectPrior),
    unfinishedDaily,
    unfinishedDailyTotalHours: roundHours(
      unfinishedDaily.reduce((sum, row) => sum + row.totalHours, 0),
    ),
    goals,
    todayBudget,
    budgetSeries,
  }
}
