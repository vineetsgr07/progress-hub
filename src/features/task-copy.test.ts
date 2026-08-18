import assert from 'node:assert/strict'
import { frequencyFilterLabel, taskCopy } from './task-copy.ts'

assert.equal(frequencyFilterLabel('Weekly', false), 'Weekly')
assert.equal(frequencyFilterLabel('Daily', true), taskCopy.frequencyShort.Daily)
assert.equal(frequencyFilterLabel('Weekly', true), 'Week')
assert.equal(frequencyFilterLabel('Monthly', true), 'Month')
assert.equal(frequencyFilterLabel('Quarterly', true), 'Qtr')
assert.equal(frequencyFilterLabel('Projects', true), 'Proj')
assert.equal(frequencyFilterLabel('All', true), 'All')
assert.equal(frequencyFilterLabel('Goal', true), 'Goal')
assert.equal(
  frequencyFilterLabel('Sprint', true),
  'Sprint',
  'custom frequencies keep their name',
)

console.log('task-copy.test.ts: ok')
