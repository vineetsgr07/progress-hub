import type { BudgetDayPoint, Stats } from '../types'
import { formatHoursShort } from '../utils/date'

export type AnalyticsInsightAction = 'open_task' | 'habits' | 'today'

export type AnalyticsInsightNudge = {
  title: string
  detail: string
  action: AnalyticsInsightAction
  taskId?: string
  ctaLabel: string
}

export const analyticsCopy = {
  pageTitle: 'Analytics',
  pageSubtitle: 'See where effort went — then take the next useful step.',
  budgetTitle: 'Today’s budget',
  budgetHint:
    'Work = timer hours toward 12h. Habits = check-ins toward a 3h budget (not a timer).',
  workLabel: 'Work',
  habitsLabel: 'Habits',
  totalLabel: 'Total',
  streakLabel: 'Streak',
  kpiWorkSub: (target: number) => `of ${formatHoursShort(target)}h focus target`,
  kpiHabitSub: (done: number, total: number, target: number) =>
    total > 0
      ? `${done}/${total} checks · ${formatHoursShort(target)}h budget`
      : `No habits yet · ${formatHoursShort(target)}h budget`,
  kpiTotalSub: (target: number) => `of ${formatHoursShort(target)}h day`,
  totalCaption: (hours: number, target: number) =>
    `${formatHoursShort(hours)} of ${formatHoursShort(target)}h combined (work + habit budget)`,
  weekPulseTitle: '14-day pulse',
  weekAvgWork: (hours: number) => `Avg work ${formatHoursShort(hours)}h / day`,
  weekAvgHabit: (hours: number) => `Avg habit budget ${formatHoursShort(hours)}h / day`,
  weekWorkHits: (n: number, total: number) =>
    `${n}/${total} days at ≥50% work target`,
  weekHabitHits: (n: number, total: number) =>
    `${n}/${total} days at ≥50% habit budget`,
  insightMissing:
    'Budget data didn’t load. Refresh the page or restart the app server, then open Analytics again.',
  insightCtaOpenTask: 'Open this Daily',
  insightCtaHabits: 'Review habits',
  insightCtaToday: 'Go to Today',
  workOfTarget: (hours: number, target: number) =>
    `${formatHoursShort(hours)} / ${formatHoursShort(target)} hrs`,
  habitOfTarget: (hours: number, target: number, done: number, total: number) =>
    total > 0
      ? `${formatHoursShort(hours)} / ${formatHoursShort(target)} hrs · ${done}/${total} checks`
      : `${formatHoursShort(hours)} / ${formatHoursShort(target)} hrs · no habits`,
  totalOfTarget: (hours: number, target: number) =>
    `${formatHoursShort(hours)} / ${formatHoursShort(target)} hrs`,
  chartTitle: 'Last 14 days',
  chartSubtitle: 'Blue = work timers · Teal = habit check-in budget',
  chartAria: 'Daily work hours and habit budget toward your targets',
  chartLegendWork: 'Work (timers)',
  chartLegendHabits: 'Habit budget (check-ins)',
  chartDayTitle: (p: BudgetDayPoint) =>
    `${p.date}: work ${formatHoursShort(p.workHours)}/${formatHoursShort(p.workTarget)}h · habits ${formatHoursShort(p.habitBudgetHours)}/${formatHoursShort(p.habitTarget)}h · total ${formatHoursShort(p.totalHours)}/${formatHoursShort(p.totalTarget)}h`,
  chartPointTitle: (
    label: string,
    completed: number,
    total: number,
    percent: number,
    hours: number,
  ) =>
    hours > 0
      ? `${label}: ${completed}/${total || '—'} · ${percent}% · ${formatHoursShort(hours)} hrs`
      : `${label}: ${completed}/${total || '—'} · ${percent}%`,
  chartCount: (completed: number, total: number, hours: number) => {
    const done =
      total > 0 ? `${completed}/${total}` : completed ? String(completed) : '·'
    return hours > 0 ? `${done} · ${formatHoursShort(hours)}h` : done
  },
  hoursByCategoryTitle: 'Where work hours went',
  hoursByProjectTitle: 'Hours by project',
  hoursRangeHint: (start: string, end: string) =>
    `Timer hours ${start} → ${end}`,
  hoursEmptyCategory: 'No timer hours in this range yet.',
  hoursEmptyProject: 'No project hours in this range yet.',
  masterDoneSub: (done: number, count: number) =>
    count > 0 ? `${done}/${count} done in master` : '',
  hoursBarValue: (hours: number) =>
    hours > 0 ? `${formatHoursShort(hours)} hrs` : '0 hrs',
  hoursShare: (percent: number) => `${percent}% of range`,
  hoursPriorDelta: (delta: number) => {
    if (delta === 0) return 'Same as prior 14d'
    const sign = delta > 0 ? '+' : '−'
    return `${sign}${formatHoursShort(Math.abs(delta))}h vs prior 14d`
  },
  carryoverTitle: 'Unfinished Daily effort',
  carryoverSummary: (count: number, hours: number) =>
    count === 1
      ? `1 Daily still open · ${formatHoursShort(hours)} hrs across days`
      : `${count} Dailies still open · ${formatHoursShort(hours)} hrs across days`,
  carryoverRow: (todayHours: number, totalHours: number) =>
    `Today ${formatHoursShort(todayHours)}h · Total ${formatHoursShort(totalHours)}h`,
  carryoverPriorDays: (days: number) =>
    days <= 0
      ? 'Prior time logged'
      : days === 1
        ? '1 prior incomplete day'
        : `${days} prior incomplete days`,
  carryoverOpen: 'Open',
  actionQueueTitle: 'Do next',
  actionQueueHint: 'Finish these before reviewing charts',
  recentDaysTitle: 'Recent logged days',
  recentDaysOpen: 'Show recent days',
  recentDaysClose: 'Hide recent days',
  habitDetailTitle: 'Habit trends',
  habitDetailHint: 'Charts and per-habit history — check-ins are in Do next above',
  habitDetailOpen: 'Show habit trends',
  habitDetailClose: 'Hide habit trends',
}

function ctaFor(action: AnalyticsInsightAction): string {
  if (action === 'open_task') return analyticsCopy.insightCtaOpenTask
  if (action === 'habits') return analyticsCopy.insightCtaHabits
  return analyticsCopy.insightCtaToday
}

function nudge(
  title: string,
  detail: string,
  action: AnalyticsInsightAction,
  taskId?: string,
): AnalyticsInsightNudge {
  return {
    title,
    detail,
    action,
    taskId,
    ctaLabel: ctaFor(action),
  }
}

export function budgetWeekPulse(series: BudgetDayPoint[]): {
  avgWork: number
  avgHabit: number
  workHits: number
  habitHits: number
  days: number
} {
  const days = series.length
  if (days === 0) {
    return { avgWork: 0, avgHabit: 0, workHits: 0, habitHits: 0, days: 0 }
  }
  const avgWork =
    Math.round(
      (series.reduce((s, p) => s + p.workHours, 0) / days) * 100,
    ) / 100
  const avgHabit =
    Math.round(
      (series.reduce((s, p) => s + p.habitBudgetHours, 0) / days) * 100,
    ) / 100
  const workHits = series.filter((p) => p.workPercent >= 50).length
  const habitHits = series.filter(
    (p) => p.habitTotal > 0 && p.habitPercent >= 50,
  ).length
  return { avgWork, avgHabit, workHits, habitHits, days }
}

export function analyticsNudge(stats: Stats): AnalyticsInsightNudge {
  const budget = stats.insight?.todayBudget
  const goals = stats.insight?.goals
  const series = stats.insight?.budgetSeries ?? []
  const unfinished = stats.insight?.unfinishedDaily ?? []
  const unfinishedHours = stats.insight?.unfinishedDailyTotalHours ?? 0

  // 1. Carryover with sunk hours — even when work is already logged today.
  if (unfinished.length > 0 && unfinishedHours > 0) {
    const top = unfinished[0]
    return nudge(
      analyticsCopy.carryoverSummary(unfinished.length, unfinishedHours),
      `“${top.title}” already has ${formatHoursShort(top.totalHours)} hrs across days — finish, cut, or demote it instead of restarting cold.`,
      'open_task',
      top.taskId,
    )
  }

  if (budget && goals) {
    // 2. Soft habit streak across the series
    const softHabitDays = series.filter(
      (d) => d.habitTotal > 0 && d.habitPercent > 0 && d.habitPercent < 50,
    ).length
    if (softHabitDays >= 4) {
      return nudge(
        'Habit budget is thin lately',
        `${softHabitDays} of the last ${series.length} days filled under half the ${formatHoursShort(goals.habitBudgetHours)}h habit budget — protect a short morning block for check-ins.`,
        'habits',
      )
    }

    // 3. Work vs habit imbalance today
    if (budget.habitTotal > 0 && budget.habitPercent < 50 && budget.workPercent >= 50) {
      return nudge(
        'Work is ahead of habits today',
        `Work is at ${budget.workPercent}% of ${formatHoursShort(goals.workTargetHours)}h, habits only ${budget.habitPercent}% of the ${formatHoursShort(goals.habitBudgetHours)}h check-in budget.`,
        'habits',
      )
    }

    if (budget.habitTotal > 0 && budget.habitPercent >= 100 && budget.workPercent < 50) {
      return nudge(
        'Habits cleared — work still open',
        `Habit budget is full. ${formatHoursShort(budget.workHours)} of ${formatHoursShort(goals.workTargetHours)}h work logged — one focused block closes the gap.`,
        'today',
      )
    }

    // 4. Budget filled / in-progress %
    if (budget.totalPercent >= 100) {
      return nudge(
        'Daily budget filled',
        `You reached ${formatHoursShort(budget.totalHours)} of ${formatHoursShort(goals.totalTargetHours)}h (work timers + habit check-in budget).`,
        'today',
      )
    }

    if (budget.totalHours > 0) {
      return nudge(
        `${budget.totalPercent}% of today’s ${formatHoursShort(goals.totalTargetHours)}h budget`,
        `Work ${analyticsCopy.workOfTarget(budget.workHours, budget.workTarget)} · Habits ${formatHoursShort(budget.habitBudgetHours)} / ${formatHoursShort(budget.habitTarget)} hrs from check-ins.`,
        'today',
      )
    }
  }

  // 5. Task-completion fallbacks
  const { total, remaining, percent, completed } = stats.today
  if (total === 0) {
    return nudge(
      'No focus tasks for this day yet',
      'Add a task on Today, then come back to track your momentum.',
      'today',
    )
  }
  if (percent >= 100) {
    return nudge(
      'Day cleared — great work',
      'Every task on today’s list is done. Keep the streak going tomorrow.',
      'today',
    )
  }
  if (percent >= 50) {
    return nudge(
      'You’re over halfway',
      remaining === 1
        ? 'One task left — finish strong.'
        : `${remaining} tasks left. A short focused block will close the gap.`,
      'today',
    )
  }
  if (percent > 0 || completed > 0) {
    return nudge(
      'Nice progress',
      remaining === 1
        ? 'One more checkbox keeps the momentum.'
        : `${remaining} left — pick the next easiest win.`,
      'today',
    )
  }
  return nudge(
    'Start the day’s budget',
    'Log work with a timer and check off habits — both count toward your daily total.',
    'today',
  )
}

export function streakLabel(streak: number): string {
  if (streak <= 0) return 'Start a streak today'
  if (streak === 1) return '1-day streak'
  return `${streak}-day streak`
}
