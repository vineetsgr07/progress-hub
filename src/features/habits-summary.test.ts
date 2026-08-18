import assert from 'node:assert/strict'
import {
  habitDaySummary,
  habitSummaryLabel,
  readHabitsCollapsed,
  writeHabitsCollapsed,
} from './habits-summary.js'
import { HABITS_COLLAPSED_KEY } from './habits-copy.js'

assert.equal(habitSummaryLabel(0, 0), '')
assert.equal(habitSummaryLabel(2, 5), '2 of 5')
assert.deepEqual(habitDaySummary([]), { completed: 0, total: 0, percent: 0 })
assert.deepEqual(
  habitDaySummary([{ completed: true }, { completed: false }, { completed: true }]),
  { completed: 2, total: 3, percent: 67 },
)

const mem = new Map<string, string>()
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => {
    mem.set(k, v)
  },
  removeItem: (k: string) => {
    mem.delete(k)
  },
} as Storage

assert.equal(readHabitsCollapsed(storage), false)
writeHabitsCollapsed(true, storage)
assert.equal(storage.getItem(HABITS_COLLAPSED_KEY), '1')
assert.equal(readHabitsCollapsed(storage), true)
writeHabitsCollapsed(false, storage)
assert.equal(readHabitsCollapsed(storage), false)

console.log('habits-summary tests passed')
