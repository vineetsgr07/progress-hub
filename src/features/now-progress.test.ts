import assert from 'node:assert/strict'
import {
  EMPTY_NOW_PROGRESS,
  computeNowProgress,
  nowProgressFromLists,
  nowProgressTotals,
} from './now-progress.ts'

assert.deepEqual(EMPTY_NOW_PROGRESS.percent, 0)
assert.deepEqual(nowProgressTotals(EMPTY_NOW_PROGRESS), {
  completed: 0,
  total: 0,
})

const mixed = nowProgressFromLists({
  checklistCompleted: 1,
  checklistTotal: 2,
  habits: [{ completed: true }, { completed: false }],
  remindersDue: [{ done: true }, { done: false }, { done: false }],
  overdueOpen: 4,
})
assert.equal(mixed.checklist.completed, 1)
assert.equal(mixed.habits.completed, 1)
assert.equal(mixed.reminders.completed, 1)
assert.equal(mixed.reminders.total, 3)
assert.equal(mixed.percent, 43)
assert.equal(mixed.overdueOpen, 4)
assert.deepEqual(nowProgressTotals(mixed), { completed: 3, total: 7 })

const full = computeNowProgress({
  checklist: { completed: 2, total: 2 },
  habits: { completed: 1, total: 1 },
  reminders: { completed: 1, total: 1 },
  overdueOpen: 0,
})
assert.equal(full.percent, 100)

const overdueIgnored = nowProgressFromLists({
  checklistCompleted: 0,
  checklistTotal: 0,
  habits: [],
  remindersDue: [{ done: false }],
  overdueOpen: 9,
})
assert.equal(overdueIgnored.percent, 0)
assert.equal(overdueIgnored.reminders.total, 1)
assert.equal(overdueIgnored.overdueOpen, 9)

console.log('now-progress.test.ts: ok')
