import assert from 'node:assert/strict'
import {
  reminderWhenAria,
  reminderWhenChip,
  reminderWhenSavedLabel,
} from './reminder-when.ts'

assert.equal(reminderWhenChip('2026-08-19', null), 'Wed 19')
assert.equal(reminderWhenChip('2026-08-19', '09:00'), 'Wed 19 · 09:00')
assert.equal(reminderWhenChip('bad', null), 'When')
assert.equal(reminderWhenSavedLabel('2026-08-19'), '19 Aug')
assert.equal(reminderWhenAria('2026-08-19', '09:00'), 'Due Wed 19 · 09:00')
assert.equal(reminderWhenAria('', null), 'Set date and time')

console.log('reminder-when.test.ts: ok')
