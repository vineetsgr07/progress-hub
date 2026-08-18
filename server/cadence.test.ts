import assert from 'node:assert/strict'
import {
  cadenceOptsFromRow,
  isCadenceDay,
  isPeriodCategory,
  previousCadenceDay,
  resolveCadenceFields,
  visibleOnToday,
} from './cadence.js'

// Friday 2026-08-07, Monday 2026-08-03, Saturday 2026-08-08, Thursday 2026-08-06
// Wednesday 2026-08-05
assert.equal(isCadenceDay('Weekly', '2026-08-07'), true)
assert.equal(isCadenceDay('Weekly', '2026-08-03'), false)

assert.equal(isCadenceDay('Monthly', '2026-08-01'), true)
assert.equal(isCadenceDay('Monthly', '2026-08-02'), false)

assert.equal(isCadenceDay('Quarterly', '2026-04-01'), true)
assert.equal(isCadenceDay('Quarterly', '2026-05-01'), false)
assert.equal(isCadenceDay('Quarterly', '2026-07-01'), true)

assert.equal(isCadenceDay('Goal', '2026-01-01'), true)
assert.equal(isCadenceDay('Goal', '2026-12-31'), false)

assert.equal(isPeriodCategory('Weekly'), true)
assert.equal(isPeriodCategory('Daily'), false)

assert.equal(previousCadenceDay('Weekly', '2026-08-08'), '2026-08-07')
assert.equal(previousCadenceDay('Weekly', '2026-08-07'), '2026-07-31')
assert.equal(previousCadenceDay('Weekly', '2026-08-06'), '2026-07-31')
assert.equal(previousCadenceDay('Monthly', '2026-08-02'), '2026-08-01')
assert.equal(previousCadenceDay('Daily', '2026-08-06'), null)

// All chip: Weekly on Friday
assert.equal(visibleOnToday('Weekly', '2026-08-07', false, null), true)
assert.equal(visibleOnToday('Weekly', '2026-08-07', true, null), true)

// All chip: overflow Saturday when prior Friday incomplete
assert.equal(visibleOnToday('Weekly', '2026-08-08', false, null), true)

// All chip: no overflow when prior occurrence completed before today
assert.equal(visibleOnToday('Weekly', '2026-08-08', true, null), false)

// All chip: mid-week after completed prior Friday → hidden (not pinned by day_entry)
assert.equal(visibleOnToday('Weekly', '2026-08-06', true, null, '2026-07-01'), false)

// All chip: mid-week when prior Friday incomplete → overflow (task existed)
assert.equal(visibleOnToday('Weekly', '2026-08-06', false, null, '2026-07-01'), true)

// All chip: created after last Friday → not overdue until this Friday
assert.equal(visibleOnToday('Weekly', '2026-08-06', false, null, '2026-08-05'), false)

// Period chip: always show that category
assert.equal(visibleOnToday('Weekly', '2026-08-03', false, 'Weekly'), true)
assert.equal(visibleOnToday('Weekly', '2026-08-03', true, 'Weekly'), true)
assert.equal(visibleOnToday('Monthly', '2026-08-03', false, 'Weekly'), false)

// Daily always on All
assert.equal(visibleOnToday('Daily', '2026-08-03', false, null), true)

// Projects on All only when pulled (day_entry); own chip always
assert.equal(visibleOnToday('Projects', '2026-08-03', false, null, null, null, false), false)
assert.equal(visibleOnToday('Projects', '2026-08-03', false, null, null, null, true), true)
assert.equal(visibleOnToday('Projects', '2026-08-03', false, 'All', null, null, false), false)
assert.equal(visibleOnToday('Projects', '2026-08-03', false, 'Projects', null, null, false), true)
assert.equal(
  visibleOnToday('Transactional', '2026-08-03', false, null, null, null, false),
  false,
)
assert.equal(
  visibleOnToday('Transactional', '2026-08-03', false, null, null, null, true),
  true,
)

// Monthly / Quarterly / Goal on All cadence + overflow
assert.equal(visibleOnToday('Monthly', '2026-08-01', false, null), true)
assert.equal(visibleOnToday('Monthly', '2026-08-02', false, null), true)
assert.equal(visibleOnToday('Monthly', '2026-08-02', true, null), false)
assert.equal(visibleOnToday('Quarterly', '2026-04-01', false, null), true)
assert.equal(visibleOnToday('Goal', '2026-01-01', false, null), true)

// ---- Per-task Weekly (Wednesday = 3) ----
const wed = { weekday: 3 }
assert.equal(isCadenceDay('Weekly', '2026-08-05', wed), true) // Wed
assert.equal(isCadenceDay('Weekly', '2026-08-07', wed), false) // Fri
assert.equal(previousCadenceDay('Weekly', '2026-08-06', wed), '2026-08-05')
assert.equal(previousCadenceDay('Weekly', '2026-08-05', wed), '2026-07-29')

// Wed All: cadence day
assert.equal(visibleOnToday('Weekly', '2026-08-05', false, null, '2026-07-01', wed), true)
// Thu after complete prior Wed → hide
assert.equal(visibleOnToday('Weekly', '2026-08-06', true, null, '2026-07-01', wed), false)
// Thu overflow when prior Wed incomplete
assert.equal(visibleOnToday('Weekly', '2026-08-06', false, null, '2026-07-01', wed), true)
// Fri: still overflow (not Friday-global) until next Wed
assert.equal(visibleOnToday('Weekly', '2026-08-07', false, null, '2026-07-01', wed), true)
assert.equal(visibleOnToday('Weekly', '2026-08-07', true, null, '2026-07-01', wed), false)

// ---- Per-task Monthly (day 15) ----
const mid = { monthDay: 15 }
assert.equal(isCadenceDay('Monthly', '2026-08-15', mid), true)
assert.equal(isCadenceDay('Monthly', '2026-08-01', mid), false)
assert.equal(previousCadenceDay('Monthly', '2026-08-16', mid), '2026-08-15')
assert.equal(visibleOnToday('Monthly', '2026-08-15', false, null, '2026-07-01', mid), true)
assert.equal(visibleOnToday('Monthly', '2026-08-16', false, null, '2026-07-01', mid), true)
assert.equal(visibleOnToday('Monthly', '2026-08-16', true, null, '2026-07-01', mid), false)
assert.equal(visibleOnToday('Monthly', '2026-08-02', false, null, '2026-07-20', mid), false)

// null opts = Friday / 1st legacy
assert.equal(isCadenceDay('Weekly', '2026-08-07', null), true)
assert.equal(isCadenceDay('Monthly', '2026-08-01', null), true)

// resolveCadenceFields
assert.deepEqual(resolveCadenceFields('Weekly'), {
  cadenceWeekday: 5,
  cadenceMonthDay: null,
})
assert.deepEqual(resolveCadenceFields('Weekly', 3), {
  cadenceWeekday: 3,
  cadenceMonthDay: null,
})
assert.deepEqual(resolveCadenceFields('Monthly', null, 15), {
  cadenceWeekday: null,
  cadenceMonthDay: 15,
})
assert.deepEqual(resolveCadenceFields('Daily'), {
  cadenceWeekday: null,
  cadenceMonthDay: null,
})
assert.ok(resolveCadenceFields('Weekly', 9).error)
assert.ok(resolveCadenceFields('Monthly', null, 31).error)

assert.deepEqual(
  cadenceOptsFromRow({ category: 'Weekly', cadence_weekday: 3 }),
  { weekday: 3 },
)
assert.deepEqual(
  cadenceOptsFromRow({ category: 'Monthly', cadence_month_day: 15 }),
  { monthDay: 15 },
)
assert.equal(cadenceOptsFromRow({ category: 'Daily' }), null)

console.log('cadence tests passed')
