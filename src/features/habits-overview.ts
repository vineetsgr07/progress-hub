import type {
  HabitProgressRow,
  HabitsDailySummary,
  HabitsProgress,
} from '../types'
import { habitsHistoryCopy } from './habits-copy'

export type HabitsOverview = {
  habitCount: number
  completedDays: number
  trackedDays: number
  percent: number
  bestStreak: number
  perfectDays: number
  activeDays: number
}

export type HabitAttentionReason =
  | 'open_today'
  | 'falling_behind'
  | 'streak_broken'

export type HabitAttention = {
  id: string
  title: string
  reason: HabitAttentionReason
}

export type HabitInsightAction = 'check_in_today' | 'open_day' | 'none'

export type HabitInsight = {
  title: string
  detail: string
  action: HabitInsightAction
  ctaLabel: string
  date?: string
  focusHabitIds: string[]
}

/** Aggregate range stats for the Habits history overview. */
export function habitsOverview(data: HabitsProgress): HabitsOverview {
  let completedDays = 0
  let trackedDays = 0
  let bestStreak = 0
  for (const habit of data.habits) {
    completedDays += habit.completedDays
    trackedDays += habit.trackedDays
    if (habit.streak > bestStreak) bestStreak = habit.streak
  }

  let perfectDays = 0
  let activeDays = 0
  for (const day of data.daily) {
    if (day.total <= 0) continue
    activeDays += 1
    if (day.completed >= day.total && day.total > 0) perfectDays += 1
  }

  const percent =
    trackedDays === 0 ? 0 : Math.round((completedDays / trackedDays) * 100)

  return {
    habitCount: data.habits.length,
    completedDays,
    trackedDays,
    percent,
    bestStreak,
    perfectDays,
    activeDays,
  }
}

function recentMissCount(habit: HabitProgressRow, lookback = 7): number {
  const tracked = habit.cells.filter((c) => c.tracked)
  const recent = tracked.slice(-lookback)
  return recent.filter((c) => !c.completed).length
}

/** Habits that need a check-in or are falling behind in the range. */
export function habitsNeedingAttention(
  data: HabitsProgress,
  focusDate: string,
): HabitAttention[] {
  const out: HabitAttention[] = []
  for (const habit of data.habits) {
    const today = habit.cells.find((c) => c.date === focusDate)
    if (today?.tracked && !today.completed) {
      out.push({
        id: habit.id,
        title: habit.title,
        reason: 'open_today',
      })
      continue
    }
    const missed = recentMissCount(habit, 7)
    if (habit.percent < 50 && habit.trackedDays >= 5 && missed >= 3) {
      out.push({
        id: habit.id,
        title: habit.title,
        reason: 'falling_behind',
      })
      continue
    }
    if (habit.streak === 0 && missed >= 2 && habit.trackedDays >= 3) {
      out.push({
        id: habit.id,
        title: habit.title,
        reason: 'streak_broken',
      })
    }
  }
  return out
}

/** Ranked next move for habit detail — prefer action over review. */
export function habitInsight(
  data: HabitsProgress,
  focusDate: string,
): HabitInsight {
  const attention = habitsNeedingAttention(data, focusDate)
  const focusIds = attention.map((a) => a.id)
  const day =
    data.daily.find((d) => d.date === focusDate) ??
    data.daily[data.daily.length - 1]

  if (day && day.total > 0 && day.completed < day.total) {
    const open = day.total - day.completed
    const top = attention.find((a) => a.reason === 'open_today') ?? attention[0]
    return {
      title: habitsHistoryCopy.insightOpenToday(open, top?.title),
      detail: habitsHistoryCopy.insightOpenTodayDetail(top?.title ?? null, open),
      action: 'check_in_today',
      ctaLabel: habitsHistoryCopy.insightCtaCheckIn,
      focusHabitIds: focusIds,
    }
  }

  const softDays = data.daily.filter(
    (d) => d.total > 0 && d.percent > 0 && d.percent < 50,
  ).length
  if (softDays >= 4) {
    return {
      title: habitsHistoryCopy.insightThinTitle,
      detail: habitsHistoryCopy.insightThinDetail(softDays, data.daily.length),
      action: 'check_in_today',
      ctaLabel: habitsHistoryCopy.insightCtaCheckIn,
      focusHabitIds: focusIds,
    }
  }

  const weakest = [...data.habits]
    .filter((h) => h.trackedDays >= 7)
    .sort((a, b) => a.percent - b.percent || a.title.localeCompare(b.title))[0]
  if (weakest && weakest.percent < 50) {
    return {
      title: habitsHistoryCopy.insightWeakTitle(weakest.title, weakest.percent),
      detail: habitsHistoryCopy.insightWeakDetail,
      action: 'check_in_today',
      ctaLabel: habitsHistoryCopy.insightCtaCheckIn,
      focusHabitIds: focusIds.includes(weakest.id)
        ? focusIds
        : [weakest.id, ...focusIds],
    }
  }

  if (day && day.total > 0 && day.completed >= day.total) {
    return {
      title: habitsHistoryCopy.insightClearedTitle,
      detail: habitsHistoryCopy.insightClearedDetail,
      action: 'none',
      ctaLabel: '',
      focusHabitIds: [],
    }
  }

  return {
    title: habitsHistoryCopy.insightStartTitle,
    detail: habitsHistoryCopy.insightStartDetail,
    action: 'check_in_today',
    ctaLabel: habitsHistoryCopy.insightCtaCheckIn,
    focusHabitIds: focusIds,
  }
}

/** Sort habits so attention items come first, then by lowest percent. */
export function sortHabitsForAction(
  habits: HabitProgressRow[],
  focusHabitIds: string[],
): HabitProgressRow[] {
  const focus = new Set(focusHabitIds)
  return [...habits].sort((a, b) => {
    const aFocus = focus.has(a.id) ? 0 : 1
    const bFocus = focus.has(b.id) ? 0 : 1
    if (aFocus !== bFocus) return aFocus - bFocus
    if (a.percent !== b.percent) return a.percent - b.percent
    return a.title.localeCompare(b.title)
  })
}

export function attentionReasonLabel(reason: HabitAttentionReason): string {
  if (reason === 'open_today') return habitsHistoryCopy.reasonOpenToday
  if (reason === 'falling_behind') return habitsHistoryCopy.reasonFallingBehind
  return habitsHistoryCopy.reasonStreakBroken
}

/** Short weekday letter for chart axis (locale-aware). */
export function dayWeekdayLetter(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'narrow' })
}

/** Day-of-month number for chart axis. */
export function dayOfMonth(iso: string): number {
  const parts = iso.split('-')
  return Number(parts[2]) || 0
}

/** Whether to show a day-of-month label (first, last, Sundays, or 1st). */
export function shouldLabelChartDay(
  day: HabitsDailySummary,
  index: number,
  total: number,
): boolean {
  if (index === 0 || index === total - 1) return true
  const [y, m, d] = day.date.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getDay() === 0 || d === 1
}

/** Bar fill height for daily % (keeps a visible stub when partial). */
export function dailyBarHeight(percent: number, total: number): number {
  if (total <= 0) return 0
  if (percent <= 0) return 0
  return Math.max(6, Math.min(100, percent))
}
