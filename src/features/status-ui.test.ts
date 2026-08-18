import assert from 'node:assert/strict'
import {
  STATUS_OPTIONS,
  isTaskStatus,
  statusSwatch,
} from './status-ui.ts'
import { taskCopy } from './task-copy.ts'

assert.equal(STATUS_OPTIONS.length, 3)
assert.deepEqual(
  STATUS_OPTIONS.map((o) => o.value),
  ['todo', 'doing', 'done'],
)
assert.equal(STATUS_OPTIONS[0].label, taskCopy.statusTodo)
assert.equal(STATUS_OPTIONS[1].label, taskCopy.statusDoing)
assert.equal(STATUS_OPTIONS[2].label, taskCopy.statusDone)

assert.equal(statusSwatch('doing').fg, '#1c49b0')
assert.equal(statusSwatch('done').fg, '#0f7a4a')
assert.ok(isTaskStatus('doing'))
assert.equal(isTaskStatus('nope'), false)

console.log('status-ui tests passed')
