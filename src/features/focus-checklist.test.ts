import {
  insertIdAfter,
  partitionChecklist,
  sortFocusChecklist,
  visibleChecklist,
} from './focus-checklist'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const items = [
  {
    id: 'c',
    taskId: 't',
    title: 'Third by position',
    done: false,
    position: 2,
    hours: 0,
    pinned: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'a',
    taskId: 't',
    title: 'Done but first',
    done: true,
    position: 0,
    hours: 0,
    pinned: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'b',
    taskId: 't',
    title: 'Open second',
    done: false,
    position: 1,
    hours: 0,
    pinned: false,
    createdAt: '',
    updatedAt: '',
  },
]

const ordered = sortFocusChecklist(items)
assertEqual(ordered.map((s) => s.id).join(','), 'b,c,a', 'open first, done last')
assertEqual(sortFocusChecklist([]).length, 0, 'empty')

const tied = sortFocusChecklist([
  { ...items[1], id: 'z', position: 0 },
  { ...items[1], id: 'a', position: 0 },
])
assertEqual(tied.map((s) => s.id).join(','), 'a,z', 'stable id tie-break among done')

const openTied = sortFocusChecklist([
  { ...items[2], id: 'z', position: 1, done: false },
  { ...items[2], id: 'm', position: 1, done: false },
])
assertEqual(openTied.map((s) => s.id).join(','), 'm,z', 'stable id tie-break among open')

const parts = partitionChecklist(ordered)
assertEqual(parts.open.map((s) => s.id).join(','), 'b,c', 'partition open')
assertEqual(parts.done.map((s) => s.id).join(','), 'a', 'partition done')
assertEqual(
  visibleChecklist(ordered, false).map((s) => s.id).join(','),
  'b,c',
  'hide done',
)
assertEqual(
  visibleChecklist(ordered, true).map((s) => s.id).join(','),
  'b,c,a',
  'show done',
)

assertEqual(
  insertIdAfter(['a', 'b', 'c'], 'a', 'x').join(','),
  'a,x,b,c',
  'insert after first',
)
assertEqual(
  insertIdAfter(['a', 'b', 'c'], 'c', 'x').join(','),
  'a,b,c,x',
  'insert after last',
)
assertEqual(
  insertIdAfter(['a', 'b'], 'missing', 'x').join(','),
  'a,b,x',
  'missing afterId appends',
)
assertEqual(
  insertIdAfter(['a', 'x', 'b'], 'a', 'x').join(','),
  'a,x,b',
  'dedupes existing newId',
)

console.log('focus-checklist tests passed')
