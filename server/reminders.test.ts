import assert from 'node:assert/strict'
import {
  groupReminderInbox,
  isPendingReminder,
  mapReminder,
  openRemindersDueOnDate,
  overdueOpenCount,
  parseDueTime,
  pendingRemindersForDate,
  remindersDueOnDate,
  sortReminders,
} from './reminders.ts'

const base = {
  id: 'r1',
  title: 'Call',
  dueDate: '2026-08-17',
  dueTime: null as string | null,
  done: false,
  position: 0,
  createdAt: '',
  updatedAt: '',
}

assert.equal(isPendingReminder(base, '2026-08-17'), true)
assert.equal(isPendingReminder(base, '2026-08-16'), false)
assert.equal(isPendingReminder({ ...base, done: true }, '2026-08-17'), false)
assert.equal(
  isPendingReminder({ ...base, dueDate: '2026-08-10' }, '2026-08-17'),
  true,
  'overdue incomplete stays pending',
)
assert.equal(
  isPendingReminder(base, '2026-08-18'),
  true,
  'undone reminder carries to the next day',
)
assert.equal(isPendingReminder({ ...base, done: true }, '2026-08-18'), false)

assert.equal(parseDueTime(undefined), undefined)
assert.equal(parseDueTime(null), null)
assert.equal(parseDueTime(''), null)
assert.equal(parseDueTime('09:30'), '09:30')
assert.equal(parseDueTime('24:00'), undefined)
assert.equal(parseDueTime('9:30'), undefined)

const sorted = sortReminders([
  { ...base, id: 'untimed', dueTime: null, position: 0 },
  { ...base, id: 'later', dueTime: '15:00', position: 1 },
  { ...base, id: 'earlier', dueTime: '09:00', position: 2 },
])
assert.deepEqual(
  sorted.map((r) => r.id),
  ['untimed', 'later', 'earlier'],
)

const pending = pendingRemindersForDate(
  [
    { ...base, id: 'today', dueDate: '2026-08-17', done: false },
    { ...base, id: 'future', dueDate: '2026-08-20', done: false },
    { ...base, id: 'done', dueDate: '2026-08-10', done: true },
    { ...base, id: 'overdue', dueDate: '2026-08-10', done: false },
  ],
  '2026-08-17',
)
assert.deepEqual(
  pending.map((r) => r.id),
  ['overdue', 'today'],
)

const dueOn = remindersDueOnDate(
  [
    { ...base, id: 'today', dueDate: '2026-08-17', done: false },
    { ...base, id: 'today-done', dueDate: '2026-08-17', done: true, position: 1 },
    { ...base, id: 'future', dueDate: '2026-08-20', done: false, position: 2 },
    { ...base, id: 'overdue', dueDate: '2026-08-10', done: false, position: 3 },
  ],
  '2026-08-17',
)
assert.deepEqual(
  dueOn.map((r) => r.id),
  ['today', 'today-done'],
)
assert.deepEqual(
  openRemindersDueOnDate(dueOn, '2026-08-17').map((r) => r.id),
  ['today'],
)
assert.equal(overdueOpenCount(dueOn.concat([{ ...base, id: 'overdue', dueDate: '2026-08-10', done: false }]), '2026-08-17'), 1)

const inbox = groupReminderInbox(
  [
    { ...base, id: 'today', dueDate: '2026-08-17', done: false },
    { ...base, id: 'future', dueDate: '2026-08-20', done: false, position: 1 },
    { ...base, id: 'done', dueDate: '2026-08-10', done: true, position: 2 },
    { ...base, id: 'overdue', dueDate: '2026-08-10', done: false, position: 3 },
  ],
  '2026-08-17',
)
assert.deepEqual(inbox.overdue.map((r) => r.id), ['overdue'])
assert.deepEqual(inbox.today.map((r) => r.id), ['today'])
assert.deepEqual(inbox.later.map((r) => r.id), ['future'])
assert.deepEqual(inbox.done.map((r) => r.id), ['done'])

const mapped = mapReminder({
  id: 'x',
  title: 'Pay bill',
  due_date: '2026-08-17',
  due_time: '08:00',
  done: 0,
  position: 3,
  created_at: 'a',
  updated_at: 'b',
})
assert.equal(mapped.dueTime, '08:00')
assert.equal(mapped.done, false)

const withBreaks = mapReminder({
  id: 'n',
  title: 'Line one\nLine two',
  due_date: '2026-08-17',
  due_time: null,
  done: 0,
  position: 0,
  created_at: 'a',
  updated_at: 'b',
})
assert.equal(withBreaks.title, 'Line one\nLine two')

console.log('reminders.test.ts: ok')
