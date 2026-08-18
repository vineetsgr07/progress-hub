import assert from 'node:assert/strict'
import {
  buildProjectSections,
  mergeSectionOrder,
  rebuildOrderedIds,
  sectionTaskCount,
  readProjectsGroupCollapsed,
  writeProjectsGroupCollapsed,
} from './projects-sections.ts'
import type { Task } from '../types.ts'

function task(partial: Partial<Task> & { id: string; projectTag: string }): Task {
  return {
    title: partial.title ?? partial.id,
    notes: '',
    category: 'Projects',
    priority: 'Medium',
    status: 'todo',
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

const tags = ['Marketing', 'Development', 'Personal'] as const

// Empty tasks → still all known project sections
const empty = buildProjectSections([], tags)
assert.equal(empty.length, 3)
assert.deepEqual(
  empty.map((s) => s.key),
  ['Marketing', 'Development', 'Personal'],
)
assert.ok(empty.every((s) => s.items.length === 0))

const a = task({ id: 'a', projectTag: 'Marketing' })
const b = task({ id: 'b', projectTag: 'Marketing' })
const c = task({ id: 'c', projectTag: 'Development' })
const orphan = task({ id: 'd', projectTag: 'Zulu' })

const sections = buildProjectSections([a, c, b, orphan], tags)
assert.deepEqual(
  sections.map((s) => s.key),
  ['Marketing', 'Development', 'Personal', 'Zulu'],
)
assert.deepEqual(
  sections.find((s) => s.key === 'Marketing')!.items.map((t) => t.id),
  ['a', 'b'],
)
assert.equal(sectionTaskCount(sections.find((s) => s.key === 'Personal')!), 0)
assert.equal(sectionTaskCount(sections.find((s) => s.key === 'Zulu')!), 1)

// Blank projectTag → Personal
const blank = buildProjectSections([task({ id: 'e', projectTag: '  ' })], ['Personal'])
assert.equal(blank[0]!.items.map((t) => t.id).join(','), 'e')

// mergeSectionOrder keeps non-section tasks in place
const all = [a, c, b]
const merged = mergeSectionOrder(all, ['b', 'a'])
assert.deepEqual(
  merged.map((t) => t.id),
  ['b', 'a', 'c'],
)
assert.deepEqual(rebuildOrderedIds(all, ['b', 'a']), ['b', 'a', 'c'])

// collapse prefs
const mem: Storage = {
  length: 0,
  clear() {},
  getItem() {
    return null
  },
  key() {
    return null
  },
  removeItem() {},
  setItem() {},
}
const store: Record<string, string> = {}
const fakeStorage = {
  ...mem,
  getItem(k: string) {
    return store[k] ?? null
  },
  setItem(k: string, v: string) {
    store[k] = v
  },
} as Storage
assert.deepEqual(readProjectsGroupCollapsed(fakeStorage), {})
writeProjectsGroupCollapsed({ Marketing: true }, fakeStorage)
assert.deepEqual(readProjectsGroupCollapsed(fakeStorage), { Marketing: true })

console.log('projects-sections tests passed')
