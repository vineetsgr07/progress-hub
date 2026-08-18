import assert from 'node:assert/strict'
import {
  canRedo,
  canUndo,
  EMPTY_HISTORY,
  pushHistory,
  redoHistory,
  undoHistory,
} from './mindmap-history.ts'

const a = { nodes: [1], edges: ['a'] }
const b = { nodes: [1, 2], edges: ['a'] }
const c = { nodes: [1, 2, 3], edges: ['a', 'b'] }

let h = EMPTY_HISTORY<number, string>()
assert.equal(canUndo(h), false)
assert.equal(canRedo(h), false)

h = pushHistory(h, a)
h = pushHistory(h, b)
assert.equal(canUndo(h), true)

let step = undoHistory(h, c)
assert.deepEqual(step.snapshot, b)
assert.equal(canRedo(step.history), true)
assert.equal(canUndo(step.history), true)

step = undoHistory(step.history, b)
assert.deepEqual(step.snapshot, a)

step = redoHistory(step.history, a)
assert.deepEqual(step.snapshot, b)

// Push clears future
h = pushHistory(step.history, c)
assert.equal(canRedo(h), false)

console.log('mindmap-history tests passed')
