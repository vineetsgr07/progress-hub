import assert from 'node:assert/strict'
import { nowCopy } from './now-copy.ts'

assert.equal(nowCopy.nav, 'Now')
assert.equal(
  nowCopy.emptyTasks,
  'Pin a checklist item from Today to work on it here.',
)
assert.equal(nowCopy.emptyReminders, 'Nothing due today. Add a reminder.')
assert.equal(nowCopy.habits, 'Habits')
assert.equal(nowCopy.emptyHabits.includes('Today'), true)
assert.equal(nowCopy.showAll(1), 'Show all (1 done)')
assert.equal(nowCopy.showAll(3), 'Show all (3 done)')
assert.equal(nowCopy.pin, 'Pin to Now')
assert.equal(nowCopy.openTask('Write brief'), 'Open “Write brief”')
assert.doesNotMatch(nowCopy.loadError, /\/api|SQL|stack/i)
assert.equal(nowCopy.dragAria('Write brief'), 'Drag to reorder Write brief')
assert.doesNotMatch(nowCopy.reorderFailed, /\/api|SQL|stack/i)

console.log('now-copy.test.ts: ok')
