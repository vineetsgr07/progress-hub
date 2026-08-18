import assert from 'node:assert/strict'
import { analyticsCopy, analyticsNudge, streakLabel } from './analytics-copy.ts'
import type { BudgetDayPoint, Stats } from '../types.ts'

assert.equal(streakLabel(0), 'Start a streak today')
assert.equal(streakLabel(1), '1-day streak')
assert.equal(streakLabel(4), '4-day streak')

assert.equal(analyticsCopy.pageTitle, 'Analytics')
assert.match(analyticsCopy.weekAvgWork(3.5), /3\.50/)

assert.equal(
  analyticsCopy.carryoverRow(0.4, 2.1),
  'Today 0.40h · Total 2.10h',
)

function budgetPoint(partial: Partial<BudgetDayPoint>): BudgetDayPoint {
  return {
    date: '2026-08-07',
    label: 'Fri',
    workHours: 6,
    workTarget: 12,
    habitBudgetHours: 1.5,
    habitTarget: 3,
    habitCompleted: 1,
    habitTotal: 2,
    totalHours: 7.5,
    totalTarget: 15,
    workPercent: 50,
    habitPercent: 50,
    totalPercent: 50,
    ...partial,
  }
}

function baseStats(partial: Partial<Stats> = {}): Stats {
  return {
    date: '2026-08-07',
    today: {
      completed: 1,
      total: 4,
      remaining: 3,
      hours: 6,
      percent: 25,
      checklistDone: 0,
      checklistTotal: 0,
      checklistPercent: 0,
    },
    streak: 2,
    history: [],
    byCategory: [],
    byProject: [],
    sessions: [],
    insight: {
      rangeStart: '2026-07-25',
      rangeEnd: '2026-08-07',
      unfinishedDaily: [],
      unfinishedDailyTotalHours: 0,
      goals: {
        workTargetHours: 12,
        habitBudgetHours: 3,
        totalTargetHours: 15,
      },
      todayBudget: budgetPoint({
        workPercent: 60,
        habitPercent: 20,
        habitTotal: 4,
        workHours: 7.2,
        habitBudgetHours: 0.6,
        totalHours: 7.8,
        totalPercent: 52,
      }),
      budgetSeries: Array.from({ length: 14 }, (_, i) =>
        budgetPoint({
          date: `2026-08-${String(i + 1).padStart(2, '0')}`,
          habitPercent: 20,
          habitTotal: 4,
        }),
      ),
    },
    ...partial,
  }
}

// Soft habit series → habits CTA (no unfinished)
const withBudget = baseStats()
const softNudge = analyticsNudge(withBudget)
assert.match(softNudge.title, /Habit budget is thin lately/)
assert.equal(softNudge.action, 'habits')
assert.equal(softNudge.ctaLabel, analyticsCopy.insightCtaHabits)

// Work hours + unfinished → carryover wins (AC1)
const withCarryover = baseStats({
  insight: {
    ...withBudget.insight!,
    unfinishedDaily: [
      {
        taskId: 'daily-1',
        title: 'Carryover daily',
        todayHours: 0.4,
        totalHours: 2.1,
        priorIncompleteDays: 2,
      },
    ],
    unfinishedDailyTotalHours: 2.1,
  },
})
const carryNudge = analyticsNudge(withCarryover)
assert.match(carryNudge.title, /Daily still open|Dailies still open/)
assert.equal(carryNudge.action, 'open_task')
assert.equal(carryNudge.taskId, 'daily-1')
assert.equal(carryNudge.ctaLabel, analyticsCopy.insightCtaOpenTask)
assert.doesNotMatch(carryNudge.title, /% of today’s/)

// Balanced day without soft habits → today CTA
const balanced = baseStats({
  insight: {
    ...withBudget.insight!,
    todayBudget: budgetPoint({
      workPercent: 40,
      habitPercent: 40,
      habitTotal: 2,
      workHours: 4.8,
      habitBudgetHours: 1.2,
      totalHours: 6,
      totalPercent: 40,
    }),
    budgetSeries: Array.from({ length: 14 }, (_, i) =>
      budgetPoint({
        date: `2026-08-${String(i + 1).padStart(2, '0')}`,
        habitPercent: 60,
        habitTotal: 2,
      }),
    ),
  },
})
const balancedNudge = analyticsNudge(balanced)
assert.equal(balancedNudge.action, 'today')
assert.match(balancedNudge.title, /40% of today’s/)

console.log('analytics-copy tests passed')
