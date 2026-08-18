import assert from 'node:assert/strict'
import { nowCopy } from './now-copy.ts'

assert.equal(nowCopy.nav, 'Now')
assert.equal(
  nowCopy.emptyTasks,
  'Pin a checklist item from Today to work on it here.',
)
assert.equal(nowCopy.emptyReminders, 'Nothing due today. Add a reminder.')
assert.equal(nowCopy.pin, 'Pin to Now')
assert.equal(nowCopy.openTask('Write brief'), 'Open “Write brief”')
assert.doesNotMatch(nowCopy.loadError, /\/api|SQL|stack/i)

console.log('now-copy.test.ts: ok')
