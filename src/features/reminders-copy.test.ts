import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { remindersCopy } from './reminders-copy.ts'

assert.equal(remindersCopy.pageTitle, 'Reminders')
assert.equal(remindersCopy.overdue, 'Overdue')
assert.equal(remindersCopy.today, 'This day')
assert.equal(remindersCopy.later, 'Later')
assert.equal(remindersCopy.done, 'Done')
assert.doesNotMatch(remindersCopy.empty, /\/api|SQL|stack/i)
assert.doesNotMatch(remindersCopy.loadError, /\/api|SQL|stack/i)

const view = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'RemindersView.tsx'),
  'utf8',
)
assert.match(view, /remindersCopy\.pageTitle/)
assert.match(view, /groupReminderInbox/)
assert.match(view, /ReminderWhen/)
assert.doesNotMatch(view, /type="time"/)

console.log('reminders-copy.test.ts: ok')
