import assert from 'node:assert/strict'
import {
  buildProjectBoard,
  dropId,
  isBandDropId,
  parseDropId,
  readProjectsNotesOpen,
  writeProjectsNotesOpen,
} from './projects-board.ts'
import type { Task } from '../types.ts'

function task(
  partial: Partial<Task> & { id: string; projectTag: string; status?: Task['status'] },
): Task {
  return {
    title: partial.title ?? partial.id,
    notes: '',
    category: 'Projects',
    priority: 'Medium',
    status: partial.status ?? 'todo',
    columnId: null,
    sortOrder: 0,
    boardSort: 0,
    isMaster: true,
    cadenceWeekday: null,
    cadenceMonthDay: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    subtasks: [],
    subtaskProgress: { done: 0, total: 0 },
    entry: null,
    ...partial,
  }
}

const tags = ['Marketing', 'Development'] as const

const empty = buildProjectBoard([], tags)
assert.equal(empty.length, 2)
assert.ok(empty.every((c) => c.bands.length === 3 && c.items.length === 0))

const a = task({ id: 'a', projectTag: 'Marketing', status: 'todo' })
const b = task({ id: 'b', projectTag: 'Marketing', status: 'doing' })
const c = task({ id: 'c', projectTag: 'Marketing', status: 'done' })
const d = task({ id: 'd', projectTag: 'Zulu', status: 'todo' })

const board = buildProjectBoard([a, b, c, d], tags)
assert.deepEqual(
  board.map((col) => col.key),
  ['Marketing', 'Development', 'Zulu'],
)
const m = board.find((col) => col.key === 'Marketing')!
assert.deepEqual(
  m.bands.map((band) => [band.status, band.items.map((t) => t.id)]),
  [
    ['todo', ['a']],
    ['doing', ['b']],
    ['done', ['c']],
  ],
)
assert.equal(board.find((col) => col.key === 'Development')!.items.length, 0)

assert.equal(dropId('Marketing', 'doing'), 'proj:Marketing::doing')
assert.deepEqual(parseDropId('proj:Marketing::doing'), {
  projectKey: 'Marketing',
  status: 'doing',
})
assert.equal(parseDropId('nope'), null)
assert.equal(isBandDropId('proj:Marketing::todo'), true)
assert.equal(isBandDropId('task-uuid-1'), false)

const store: Record<string, string> = {}
const fake = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v
  },
} as Storage
assert.equal(readProjectsNotesOpen(fake), false)
writeProjectsNotesOpen(true, fake)
assert.equal(readProjectsNotesOpen(fake), true)

console.log('projects-board tests passed')
