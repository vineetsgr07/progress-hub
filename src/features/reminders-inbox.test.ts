import assert from 'node:assert/strict'
import { groupReminderInbox } from './reminders-inbox.ts'

const items = [
  {
    id: 'today',
    title: 'Today',
    dueDate: '2026-08-17',
    dueTime: null,
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'later',
    title: 'Later',
    dueDate: '2026-08-20',
    dueTime: null,
    done: false,
    position: 1,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'done',
    title: 'Done',
    dueDate: '2026-08-10',
    dueTime: null,
    done: true,
    position: 2,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'overdue',
    title: 'Overdue',
    dueDate: '2026-08-10',
    dueTime: null,
    done: false,
    position: 3,
    createdAt: '',
    updatedAt: '',
  },
]

const grouped = groupReminderInbox(items, '2026-08-17')
assert.deepEqual(grouped.overdue.map((r) => r.id), ['overdue'])
assert.deepEqual(grouped.today.map((r) => r.id), ['today'])
assert.deepEqual(grouped.later.map((r) => r.id), ['later'])
assert.deepEqual(grouped.done.map((r) => r.id), ['done'])

console.log('reminders-inbox.test.ts: ok')
