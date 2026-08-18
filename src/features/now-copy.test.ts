import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nowCopy } from './now-copy.ts'

assert.equal(nowCopy.nav, 'Now')
assert.equal(nowCopy.navReminders, 'Reminders')
assert.equal(nowCopy.emptyTasks, 'Pin a checklist item from Today.')
assert.equal(nowCopy.emptyHabits, 'Add habits on Today.')
assert.equal(nowCopy.emptyReminders, 'Nothing waiting. Add a reminder.')
assert.equal(nowCopy.addReminder, 'Add a reminder')
assert.equal(nowCopy.addReminderShort, 'Add')
assert.equal(nowCopy.stillOpen('2026-08-16'), 'Still open from 2026-08-16')
assert.equal(
  nowCopy.stillOpenTimed('2026-08-16', '09:00'),
  'Still open from 2026-08-16 · 09:00',
)
assert.equal(nowCopy.habits, 'Habits')
assert.equal(nowCopy.showAll(1), 'Show all (1 done)')
assert.equal(nowCopy.showAll(3), 'Show all (3 done)')
assert.equal(nowCopy.pin, 'Pin to Now')
assert.equal(nowCopy.openTask('Write brief'), 'Open “Write brief”')
assert.doesNotMatch(nowCopy.loadError, /\/api|SQL|stack/i)
assert.equal(nowCopy.dragAria('Write brief'), 'Drag to reorder Write brief')
assert.equal(nowCopy.dragReminder('Call'), 'Drag to reorder Call')
assert.equal(nowCopy.editReminder, 'Edit reminder')
assert.doesNotMatch(nowCopy.reorderFailed, /\/api|SQL|stack/i)
assert.equal(nowCopy.pulseDone, 'That’s the day')
assert.equal(nowCopy.savedFor('19 Aug'), 'Saved for 19 Aug')
assert.doesNotMatch(nowCopy.pulseEmpty, /\/api|SQL|stack/i)

const here = path.dirname(fileURLToPath(import.meta.url))
const nowView = readFileSync(path.join(here, 'NowView.tsx'), 'utf8')
const reminderList = readFileSync(path.join(here, 'ReminderList.tsx'), 'utf8')
const headingIds = [
  ...nowView.matchAll(/id="(now-(?:habits|tasks|reminders)-title)"/g),
].map((match) => match[1])
assert.deepEqual(headingIds, [
  'now-tasks-title',
  'now-habits-title',
  'now-reminders-title',
])
assert.match(nowView, /aria-label=\{nowCopy\.addReminder\}/)
assert.match(nowView, /\{nowCopy\.addReminderShort\}/)
assert.match(nowView, /nowPageCache/)
assert.match(nowView, /rememberNowPage/)
assert.match(nowView, /const soft = nowPageCache/)
assert.match(nowView, /NowPulse/)
assert.match(nowView, /ReminderWhen/)
assert.doesNotMatch(nowView, /type="time"/)
assert.match(reminderList, /nowCopy\.editReminder/)
assert.match(reminderList, /nowCopy\.dragReminder/)
assert.match(reminderList, /now-reminder-editor-row/)
assert.match(reminderList, /setTimeout/)
assert.match(reminderList, /document\.activeElement/)
assert.doesNotMatch(reminderList, /TimeControl/)
assert.doesNotMatch(reminderList, /type="time"/)

console.log('now-copy.test.ts: ok')
