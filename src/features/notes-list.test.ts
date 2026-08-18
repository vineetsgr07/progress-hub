import assert from 'node:assert/strict'
import {
  applyManualNoteOrder,
  buildNoteSections,
  effectiveNoteSort,
  mergeNoteOrder,
  noteItemKey,
  parseNoteGroupBy,
  parseNoteLayout,
  readNotesGroupCollapsed,
  readNotesLayout,
  relativeUpdatedAt,
  sectionItemCount,
  sortClientNotes,
  writeNotesGroupCollapsed,
  writeNotesLayout,
  type NoteListItem,
} from './notes-list.ts'

const base: NoteListItem = {
  id: '1',
  source: 'note',
  title: 'A',
  excerpt: 'x',
  projectTag: 'Personal',
  priority: 'Medium',
  pinned: false,
  updatedAt: '2026-08-06T12:00:00.000Z',
  createdAt: '2026-08-01T12:00:00.000Z',
}

const items: NoteListItem[] = [
  { ...base, id: 'low', priority: 'Low', updatedAt: '2026-08-06T10:00:00.000Z' },
  {
    ...base,
    id: 'high',
    priority: 'High',
    updatedAt: '2026-08-05T10:00:00.000Z',
    projectTag: 'Marketing',
  },
  {
    ...base,
    id: 'pinned',
    priority: 'Low',
    pinned: true,
    updatedAt: '2026-08-01T10:00:00.000Z',
  },
  {
    ...base,
    id: 'mkt-med',
    priority: 'Medium',
    projectTag: 'Marketing',
    updatedAt: '2026-08-06T11:00:00.000Z',
  },
]

const byPriority = sortClientNotes(items, 'priority')
assert.equal(byPriority[0].id, 'pinned')
assert.equal(byPriority[1].id, 'high')
assert.equal(byPriority[2].id, 'mkt-med')
assert.equal(byPriority[3].id, 'low')

const byUpdated = sortClientNotes(items, 'updated')
assert.equal(byUpdated[0].id, 'pinned')
assert.equal(byUpdated[1].id, 'mkt-med')

assert.equal(
  relativeUpdatedAt('2026-08-06T12:00:00.000Z', Date.parse('2026-08-06T12:00:30.000Z')),
  'Just now',
)
assert.equal(
  relativeUpdatedAt('2026-08-06T11:00:00.000Z', Date.parse('2026-08-06T12:00:00.000Z')),
  '1h ago',
)

assert.equal(parseNoteGroupBy('project'), 'project')
assert.equal(parseNoteGroupBy('nope'), 'none')
assert.equal(effectiveNoteSort('project', 'project'), 'updated')
assert.equal(effectiveNoteSort('project', 'priority'), 'priority')

const flat = buildNoteSections(items, 'none', 'updated')
assert.equal(flat.length, 1)
assert.equal(flat[0].key, '__flat__')
assert.equal(flat[0].items[0].id, 'pinned')

const byProject = buildNoteSections(items, 'project', 'updated')
assert.deepEqual(
  byProject.map((s) => s.key),
  ['Marketing', 'Personal'],
)
assert.equal(sectionItemCount(byProject[0]), 2)
assert.equal(byProject[0].items[0].id, 'mkt-med')

// Two levels: group by project, then sort by priority inside — no nested headers
const groupThenSort = buildNoteSections(items, 'project', 'priority')
assert.equal(groupThenSort[0].key, 'Marketing')
assert.deepEqual(
  groupThenSort[0].items.map((n) => n.id),
  ['high', 'mkt-med'],
)

const byPri = buildNoteSections(items, 'priority', 'project')
assert.deepEqual(
  byPri.map((s) => s.key),
  ['High', 'Medium', 'Low'],
)
assert.equal(byPri[2].items[0].id, 'pinned')
assert.equal(byPri[2].items[1].id, 'low')

const sameKey = buildNoteSections(items, 'project', 'project')
assert.equal(sameKey[0].items.length, 2)
assert.equal(sameKey[0].items[0].id, 'mkt-med')

const storage = {
  data: new Map<string, string>(),
  getItem(key: string) {
    return this.data.get(key) ?? null
  },
  setItem(key: string, value: string) {
    this.data.set(key, value)
  },
  removeItem(key: string) {
    this.data.delete(key)
  },
  clear() {
    this.data.clear()
  },
  key() {
    return null
  },
  get length() {
    return this.data.size
  },
} as Storage

assert.deepEqual(readNotesGroupCollapsed(storage), {})
writeNotesGroupCollapsed({ Marketing: true }, storage)
assert.deepEqual(readNotesGroupCollapsed(storage), { Marketing: true })

assert.equal(parseNoteLayout('list'), 'list')
assert.equal(parseNoteLayout('grid'), 'grid')
assert.equal(parseNoteLayout('nope'), 'list')
assert.equal(readNotesLayout(storage), 'list')
writeNotesLayout('grid', storage)
assert.equal(readNotesLayout(storage), 'grid')

assert.equal(noteItemKey({ source: 'note', id: 'abc' }), 'note:abc')
assert.deepEqual(
  mergeNoteOrder(['note:a', 'task:x', 'note:b', 'task:y', 'note:c'], [
    'note:c',
    'note:a',
    'note:b',
  ]),
  ['note:c', 'task:x', 'note:a', 'task:y', 'note:b'],
)
assert.deepEqual(mergeNoteOrder([], ['note:a', 'note:b']), ['note:a', 'note:b'])

const manualItems: NoteListItem[] = [
  { ...base, id: 'a', source: 'note' },
  { ...base, id: 'b', source: 'note' },
  { ...base, id: 'c', source: 'task' },
]
assert.deepEqual(
  applyManualNoteOrder(manualItems, ['note:b', 'task:c', 'note:a']).map((n) =>
    noteItemKey(n),
  ),
  ['note:b', 'task:c', 'note:a'],
)
assert.equal(sortClientNotes(manualItems, 'manual', []).length, 3)

console.log('notes-list tests passed')
