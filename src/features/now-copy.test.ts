import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nowCopy } from './now-copy.ts'

assert.equal(nowCopy.nav, 'Now')
assert.equal(
  nowCopy.emptyTasks,
  'Pin a checklist item from Today to work on it here.',
)
assert.equal(nowCopy.emptyReminders, 'Nothing waiting. Add a reminder.')
assert.equal(nowCopy.stillOpen('2026-08-16'), 'Still open from 2026-08-16')
assert.equal(
  nowCopy.stillOpenTimed('2026-08-16', '09:00'),
  'Still open from 2026-08-16 · 09:00',
)
assert.equal(nowCopy.habits, 'Habits')
assert.equal(nowCopy.emptyHabits.includes('Today'), true)
assert.equal(nowCopy.showAll(1), 'Show all (1 done)')
assert.equal(nowCopy.showAll(3), 'Show all (3 done)')
assert.equal(nowCopy.pin, 'Pin to Now')
assert.equal(nowCopy.openTask('Write brief'), 'Open “Write brief”')
assert.doesNotMatch(nowCopy.loadError, /\/api|SQL|stack/i)
assert.equal(nowCopy.dragAria('Write brief'), 'Drag to reorder Write brief')
assert.doesNotMatch(nowCopy.reorderFailed, /\/api|SQL|stack/i)

const nowView = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'NowView.tsx'),
  'utf8',
)
const headingIds = [
  ...nowView.matchAll(/id="(now-(?:habits|tasks|reminders)-title)"/g),
].map((match) => match[1])
assert.deepEqual(headingIds, [
  'now-tasks-title',
  'now-habits-title',
  'now-reminders-title',
])

console.log('now-copy.test.ts: ok')
