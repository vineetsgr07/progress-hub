import assert from 'node:assert/strict'
import {
  aggregateSessionBlocks,
  sessionSharePercent,
} from './hours-share.ts'
import { timerCopy } from './timer-copy.ts'
import type { TimeSession } from '../types.ts'

assert.equal(sessionSharePercent(0.5, 2), 25)
assert.equal(sessionSharePercent(1, 1), 100)
assert.equal(sessionSharePercent(0.01, 2), 1)
assert.equal(sessionSharePercent(0, 2), 0)
assert.equal(sessionSharePercent(1, 0), 0)
assert.equal(timerCopy.shareOfToday(42), '42% of today')
assert.equal(timerCopy.liveSuffix, ' · live')
assert.equal(
  timerCopy.durationAndShare('1:12:00', 42),
  '1:12:00 · 42% of today',
)
assert.equal(timerCopy.overflowRemainder(2, '0:18'), 'and 2 smaller · 0:18')

const sessions: TimeSession[] = [
  {
    id: 's1',
    taskId: 't1',
    title: 'Ship UI',
    projectTag: 'Ops',
    priority: 'High',
    subtaskId: null,
    subtaskTitle: null,
    hours: 0.5,
    createdAt: '2026-08-07T10:00:00.000Z',
    running: false,
  },
  {
    id: 's2',
    taskId: 't1',
    title: 'Ship UI',
    projectTag: 'Ops',
    priority: 'High',
    subtaskId: null,
    subtaskTitle: null,
    hours: 0.25,
    createdAt: '2026-08-07T12:00:00.000Z',
    running: false,
  },
  {
    id: 's3',
    taskId: 't2',
    title: 'Notes',
    projectTag: '',
    priority: 'Low',
    subtaskId: 'c1',
    subtaskTitle: 'Draft',
    hours: 0.1,
    createdAt: '2026-08-07T14:00:00.000Z',
    running: false,
  },
]

const blocks = aggregateSessionBlocks(sessions, 0)
assert.equal(blocks.length, 2)
assert.equal(blocks[0].title, 'Ship UI')
assert.equal(blocks[0].sessionCount, 2)
assert.equal(blocks[0].displayHours, 0.75)
assert.equal(blocks[0].projectTag, 'Ops')
assert.equal(blocks[1].subtaskTitle, 'Draft')
assert.equal(blocks[1].sessionCount, 1)

console.log('hours-breakdown tests passed')
