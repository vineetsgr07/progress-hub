import type { ProgressPoint, ProgressRange } from '../types'

export const progressCopy = {
  title: 'Progress',
  rangeAria: 'Progress range',
  chartAria: (range: ProgressRange) => {
    switch (range) {
      case 'day':
        return 'Completion over the last 14 days'
      case 'week':
        return 'Completion over the last 8 weeks'
      case 'month':
        return 'Completion over the last 6 months'
    }
  },
  empty: 'No focus tasks in this range yet. Add a task on Today to start the chart.',
  error: 'Couldn’t load progress. Check that the app server is running, then try again.',
  retry: 'Retry',
  loading: 'Loading progress…',
  summary: (completed: number, total: number, percent: number) =>
    total > 0
      ? `${completed} of ${total} tasks · ${percent}%`
      : 'No tasks in this range',
  linkAnalytics: 'Full analytics',
  completedLabel: 'COMPLETED',
  hoursLabel: 'HOURS',
  hoursValue: (h: string) => `${h} hrs`,
  /** Compact today line: `3 / 5 · 72%` — week panel owns the big progress chrome. */
  dayCompactTasks: (completed: number, total: number, percent: number) =>
    `${completed} / ${total} · ${percent}%`,
  timerLive: 'Timer running',
  timerIdle: 'No timer running',
  tasksDone: (completed: number, total: number) => `${completed} / ${total} tasks`,
  checklistDone: (completed: number, total: number) =>
    total > 0 ? `${completed} / ${total} checklist` : 'No checklist items',
  completedAria: completedAriaLabel,
  hoursSnapshotAria: (hoursLabel: string, timerRunning: boolean) => {
    const timer = timerRunning ? 'Timer running' : 'No timer running'
    return `Hours logged: ${hoursLabel}. ${timer}`
  },
  daySnapshotAria: (
    tasksDone: number,
    tasksTotal: number,
    checklistDone: number,
    checklistTotal: number,
    hoursLabel: string,
    timerRunning: boolean,
  ) => {
    const base = completedAriaLabel(
      tasksDone,
      tasksTotal,
      checklistDone,
      checklistTotal,
    )
    const timer = timerRunning ? 'Timer running' : 'No timer running'
    return `${base}. Hours logged: ${hoursLabel}. ${timer}`
  },
} as const

function completedAriaLabel(
  tasksDone: number,
  tasksTotal: number,
  checklistDone: number,
  checklistTotal: number,
): string {
  const tasks = `${tasksDone} of ${tasksTotal} tasks`
  if (checklistTotal <= 0) return `Completed: ${tasks}`
  return `Completed: ${tasks}, ${checklistDone} of ${checklistTotal} checklist items`
}

export const weekCopy = {
  title: 'This week',
  titlePast: 'That week',
  rangeAria: 'Week navigation',
  prevWeek: 'Previous week',
  nextWeek: 'Next week',
  chartAria: 'Completion for each day this week',
  empty: 'No focus tasks this week yet. Add a task on Today to start the chart.',
  error: 'Couldn’t load this week. Check that the app server is running, then try again.',
  retry: 'Retry',
  loading: 'Loading week…',
  linkAnalytics: 'Full analytics',
  doneOf: (completed: number, total: number) =>
    total > 0 ? `${completed} of ${total} done` : 'No tasks yet',
  hours: (h: string) => `${h} hrs`,
  streak: (n: number) => (n > 0 ? `${n}-day streak` : 'No streak yet'),
  jumpToday: 'Today',
  jumpTodayAria: 'Jump to today’s metrics',
  browseHint: 'Select a day in this week to set a goal or open that day’s tasks.',
  dayGoalLabel: 'Day goal',
  dayGoalPlaceholder: 'What’s the one outcome for this day?',
  dayGoalEmpty: 'No goal set for this day',
  dayGoalAria: 'Day goal for the selected date',
  dayAria: (
    label: string,
    dayOfMonth: number,
    completed: number,
    total: number,
    percent: number,
  ) =>
    total > 0
      ? `${label} ${dayOfMonth}: ${completed} of ${total} done, ${percent}%`
      : `${label} ${dayOfMonth}: no tasks`,
} as const

export const progressRangeOptions: Array<{ value: ProgressRange; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export function seriesTotals(series: ProgressPoint[]): {
  completed: number
  total: number
  percent: number
} {
  let completed = 0
  let total = 0
  for (const point of series) {
    if (point.total <= 0) continue
    completed += point.completed
    total += point.total
  }
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
  }
}

export function isSelectedBucket(
  point: ProgressPoint,
  range: ProgressRange,
  selectedDate: string,
): boolean {
  if (range === 'day') return point.key === selectedDate
  if (range === 'week') {
    // key is Monday of ISO week
    const [y, m, d] = selectedDate.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const day = date.getDay()
    const delta = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + delta)
    const yy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return point.key === `${yy}-${mm}-${dd}`
  }
  return point.key === selectedDate.slice(0, 7)
}

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** e.g. "Mon 3 – Sun 9 Aug" */
export function weekRangeLabel(weekStart: string, weekEnd: string): string {
  const start = parseLocal(weekStart)
  const end = parseLocal(weekEnd)
  const startWd = start.toLocaleDateString('en-US', { weekday: 'short' })
  const endWd = end.toLocaleDateString('en-US', { weekday: 'short' })
  const startDay = start.getDate()
  const endDay = end.getDate()
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' })
  if (start.getMonth() === end.getMonth()) {
    return `${startWd} ${startDay} – ${endWd} ${endDay} ${endMonth}`
  }
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' })
  return `${startWd} ${startDay} ${startMonth} – ${endWd} ${endDay} ${endMonth}`
}

/** Delta chip vs previous week. */
export function deltaLabel(
  currentPercent: number,
  previousPercent: number,
  previousTotal: number,
): string {
  if (previousTotal <= 0) return 'First week tracked'
  const delta = currentPercent - previousPercent
  if (delta === 0) return 'Same as last week'
  if (delta > 0) return `+${delta} pts vs last week`
  return `${delta} pts vs last week`
}

export function startOfIsoWeek(dateISO: string): string {
  const date = parseLocal(dateISO)
  const day = date.getDay()
  const delta = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + delta)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function shiftISODateLocal(iso: string, days: number): string {
  const date = parseLocal(iso)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
