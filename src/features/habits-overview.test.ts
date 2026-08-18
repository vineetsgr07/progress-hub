import assert from 'node:assert/strict'
import {
  attentionReasonLabel,
  dailyBarHeight,
  dayOfMonth,
  dayWeekdayLetter,
  habitInsight,
  habitsNeedingAttention,
  habitsOverview,
  shouldLabelChartDay,
  sortHabitsForAction,
} from './habits-overview.js'
import type { HabitProgressRow, HabitsProgress } from '../types.js'

function cells(
  dates: Array<{ date: string; completed: boolean; tracked?: boolean }>,
) {
  return dates.map((d) => ({
    date: d.date,
    completed: d.completed,
    tracked: d.tracked !== false,
  }))
}

function habit(
  partial: Partial<HabitProgressRow> & Pick<HabitProgressRow, 'id' | 'title'>,
): HabitProgressRow {
  return {
    archived: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    completedDays: 10,
    trackedDays: 14,
    percent: 70,
    streak: 2,
    cells: [],
    ...partial,
  }
}

const sample: HabitsProgress = {
  startDate: '2026-07-10',
  endDate: '2026-08-06',
  days: 28,
  habits: [
    habit({
      id: 'h1',
      title: 'Meditate',
      completedDays: 20,
      trackedDays: 28,
      percent: 71,
      streak: 3,
      cells: [],
    }),
    habit({
      id: 'h2',
      title: 'Walk',
      completedDays: 14,
      trackedDays: 28,
      percent: 50,
      streak: 0,
      cells: [],
    }),
  ],
  daily: [
    { date: '2026-08-01', completed: 2, total: 2, percent: 100 },
    { date: '2026-08-02', completed: 1, total: 2, percent: 50 },
    { date: '2026-08-03', completed: 0, total: 2, percent: 0 },
    { date: '2026-08-04', completed: 0, total: 0, percent: 0 },
  ],
}

const overview = habitsOverview(sample)
assert.equal(overview.habitCount, 2)
assert.equal(overview.completedDays, 34)
assert.equal(overview.trackedDays, 56)
assert.equal(overview.percent, 61)
assert.equal(overview.bestStreak, 3)
assert.equal(overview.perfectDays, 1)
assert.equal(overview.activeDays, 3)

assert.equal(dailyBarHeight(0, 2), 0)
assert.equal(dailyBarHeight(50, 0), 0)
assert.equal(dailyBarHeight(3, 2), 6)
assert.equal(dailyBarHeight(100, 2), 100)

assert.equal(dayOfMonth('2026-08-06'), 6)
assert.ok(dayWeekdayLetter('2026-08-06').length >= 1)
assert.equal(
  shouldLabelChartDay({ date: '2026-08-02', completed: 1, total: 2, percent: 50 }, 0, 4),
  true,
)
assert.equal(
  shouldLabelChartDay(
    { date: '2026-08-03', completed: 0, total: 2, percent: 0 },
    1,
    4,
  ),
  false,
)

const empty = habitsOverview({
  ...sample,
  habits: [],
  daily: [],
})
assert.equal(empty.percent, 0)
assert.equal(empty.bestStreak, 0)

// Open today → check-in insight
const openToday: HabitsProgress = {
  startDate: '2026-07-25',
  endDate: '2026-08-07',
  days: 14,
  habits: [
    habit({
      id: 'h1',
      title: 'Meditate',
      percent: 80,
      streak: 1,
      cells: cells([
        { date: '2026-08-06', completed: true },
        { date: '2026-08-07', completed: false },
      ]),
    }),
    habit({
      id: 'h2',
      title: 'Walk',
      percent: 40,
      streak: 0,
      cells: cells([
        { date: '2026-08-06', completed: false },
        { date: '2026-08-07', completed: false },
      ]),
    }),
  ],
  daily: [
    { date: '2026-08-07', completed: 0, total: 2, percent: 0 },
  ],
}

const attention = habitsNeedingAttention(openToday, '2026-08-07')
assert.equal(attention.length, 2)
assert.equal(attention[0].reason, 'open_today')
assert.equal(attentionReasonLabel('open_today'), 'Still open today')

const openInsight = habitInsight(openToday, '2026-08-07')
assert.match(openInsight.title, /habits? still open today/i)
assert.equal(openInsight.action, 'check_in_today')
assert.ok(openInsight.ctaLabel.length > 0)
assert.ok(openInsight.focusHabitIds.includes('h1'))

const sorted = sortHabitsForAction(openToday.habits, openInsight.focusHabitIds)
assert.equal(sorted[0].id, 'h2') // lower percent among focus, or focus first
assert.ok(openInsight.focusHabitIds.includes(sorted[0].id))

// Cleared today
const cleared: HabitsProgress = {
  ...openToday,
  habits: [
    habit({
      id: 'h1',
      title: 'Meditate',
      percent: 90,
      streak: 4,
      trackedDays: 14,
      cells: cells([{ date: '2026-08-07', completed: true }]),
    }),
  ],
  daily: [{ date: '2026-08-07', completed: 1, total: 1, percent: 100 }],
}
const clearedInsight = habitInsight(cleared, '2026-08-07')
assert.equal(clearedInsight.action, 'none')
assert.match(clearedInsight.title, /cleared/i)

// Weak habit when today is clear
const weak: HabitsProgress = {
  startDate: '2026-07-25',
  endDate: '2026-08-07',
  days: 14,
  habits: [
    habit({
      id: 'weak',
      title: 'Journal',
      percent: 30,
      trackedDays: 14,
      streak: 0,
      cells: cells([
        { date: '2026-08-01', completed: false },
        { date: '2026-08-02', completed: false },
        { date: '2026-08-03', completed: false },
        { date: '2026-08-07', completed: true },
      ]),
    }),
  ],
  daily: [{ date: '2026-08-07', completed: 1, total: 1, percent: 100 }],
}
const weakInsight = habitInsight(weak, '2026-08-07')
assert.equal(weakInsight.action, 'check_in_today')
assert.match(weakInsight.title, /Journal/)

console.log('habits-overview tests passed')
