import assert from 'node:assert/strict'
import {
  deltaLabel,
  progressCopy,
  shiftISODateLocal,
  startOfIsoWeek,
  weekCopy,
  weekRangeLabel,
} from './progress-copy.ts'

assert.equal(startOfIsoWeek('2026-08-05'), '2026-08-03') // Wed → Mon
assert.equal(startOfIsoWeek('2026-08-09'), '2026-08-03') // Sun → Mon
assert.equal(shiftISODateLocal('2026-08-03', 7), '2026-08-10')
assert.equal(weekRangeLabel('2026-08-03', '2026-08-09'), 'Mon 3 – Sun 9 Aug')
assert.equal(weekRangeLabel('2026-07-27', '2026-08-02'), 'Mon 27 Jul – Sun 2 Aug')
assert.equal(deltaLabel(50, 40, 10), '+10 pts vs last week')
assert.equal(deltaLabel(30, 40, 10), '-10 pts vs last week')
assert.equal(deltaLabel(40, 40, 10), 'Same as last week')
assert.equal(deltaLabel(40, 0, 0), 'First week tracked')

assert.equal(
  progressCopy.dayCompactTasks(3, 5, 72),
  '3 / 5 · 72%',
)
assert.equal(
  progressCopy.completedAria(2, 5, 1, 3),
  'Completed: 2 of 5 tasks, 1 of 3 checklist items',
)
assert.equal(
  progressCopy.daySnapshotAria(2, 5, 1, 3, '1.5 hrs', true),
  'Completed: 2 of 5 tasks, 1 of 3 checklist items. Hours logged: 1.5 hrs. Timer running',
)
assert.equal(
  progressCopy.hoursSnapshotAria('1.5 hrs', true),
  'Hours logged: 1.5 hrs. Timer running',
)
assert.equal(progressCopy.hoursValue('2'), '2 hrs')
assert.equal(
  weekCopy.browseHint.startsWith('Select a day'),
  true,
)

console.log('progress-copy tests passed')
