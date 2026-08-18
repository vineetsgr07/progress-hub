import type { PinnedChecklistItem, Task } from '../types'
import {
  ensureTaskPresent,
  overlayNowItems,
  settleRunningSubtaskTimer,
} from './task-merge'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Parent',
    notes: '',
    category: 'Daily',
    projectTag: '',
    priority: 'Medium',
    status: 'doing',
    sortOrder: 0,
    columnId: null,
    boardSort: 0,
    isMaster: false,
    cadenceWeekday: null,
    cadenceMonthDay: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    subtasks: [
      {
        id: 'sub-a',
        taskId: 'task-1',
        title: 'Alpha',
        done: false,
        position: 0,
        hours: 0.1,
        pinned: false,
        pinSort: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-b',
        taskId: 'task-1',
        title: 'Beta',
        done: false,
        position: 1,
        hours: 0,
        pinned: false,
        pinSort: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    subtaskProgress: { done: 0, total: 2 },
    entry: {
      id: 'entry-1',
      date: '2026-08-12',
      completed: false,
      hours: 0.5,
      timerStartedAt: new Date(Date.now() - 3_600_000).toISOString(),
      timerSubtaskId: 'sub-a',
      notes: '',
    },
    ...overrides,
  }
}

{
  const [next] = settleRunningSubtaskTimer([baseTask()], 'task-1', 'sub-a')
  assert(next.entry?.timerStartedAt === null, 'timer should clear')
  assert(next.entry?.timerSubtaskId === null, 'timer subtask should clear')
  assert(next.entry!.hours > 1.4, 'entry hours should include elapsed')
  assert(next.subtasks![0].hours > 1.0, 'subtask hours should include elapsed')
  assert(next.status === 'todo', 'doing should return to todo')
}

{
  const before = baseTask()
  const [next] = settleRunningSubtaskTimer([before], 'task-1', 'sub-b')
  assert(
    next.entry?.timerStartedAt === before.entry?.timerStartedAt,
    'other item done should not clear timer',
  )
  assert(next.entry?.timerSubtaskId === 'sub-a', 'timer stays on alpha')
  assert(next.status === 'doing', 'status unchanged')
}

{
  const live = baseTask({
    subtasks: [
      { ...baseTask().subtasks[0], title: 'Renamed', pinned: true },
      baseTask().subtasks[1],
    ],
  })
  const stale = baseTask({
    subtasks: [
      { ...baseTask().subtasks[0], title: 'Alpha', pinned: true },
      baseTask().subtasks[1],
    ],
  })
  const kept = ensureTaskPresent([live], stale)
  assert(kept.length === 1, 'existing task is not duplicated')
  assert(kept[0].subtasks[0].title === 'Renamed', 'live title wins over snapshot')
  const inserted = ensureTaskPresent([], stale)
  assert(inserted.length === 1, 'missing task is inserted')
  assert(inserted[0].id === 'task-1', 'inserted snapshot keeps id')
}

{
  const pinned = {
    ...baseTask().subtasks[0],
    title: 'Alpha',
    pinned: true,
    taskTitle: 'Parent',
    task: baseTask(),
    timerStartedAt: null,
    timerSubtaskId: null,
  } satisfies PinnedChecklistItem
  const live = baseTask({
    title: 'Live parent',
    subtasks: [{ ...pinned, title: 'Live title', pinned: true }],
    entry: { ...baseTask().entry!, timerStartedAt: '2026-08-12T10:00:00.000Z' },
  })
  const [overlaid] = overlayNowItems([pinned], [live])
  assert(overlaid.title === 'Live title', 'overlay applies live title')
  assert(overlaid.taskTitle === 'Live parent', 'overlay applies live parent title')
  assert(overlaid.task === live, 'overlay uses live task')
  assert(
    overlaid.timerStartedAt === '2026-08-12T10:00:00.000Z',
    'overlay copies live timer',
  )
  assert(overlayNowItems([pinned], []).length === 1, 'empty tasks keeps snapshot')
  const done = baseTask({
    subtasks: [{ ...pinned, title: 'Live title', pinned: true, done: true }],
  })
  assert(overlayNowItems([pinned], [done]).length === 0, 'overlay hides done')
  const unpinned = baseTask({
    subtasks: [{ ...pinned, pinned: false }],
  })
  assert(overlayNowItems([pinned], [unpinned]).length === 0, 'overlay hides unpinned')
}

console.log('task-merge tests passed')
