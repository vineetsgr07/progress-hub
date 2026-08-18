import assert from 'node:assert/strict'
import {
  NOTES_LIST_LIMIT,
  NOTES_LIST_LIMIT_MAX,
  notesStandaloneWhere,
  notesTaskWhere,
  parseNoteScope,
  parseNotesLimit,
  parsePinnedOnly,
} from './notes-list.ts'

assert.equal(parseNoteScope(undefined), 'recent')
assert.equal(parseNoteScope(''), 'recent')
assert.equal(parseNoteScope('recent'), 'recent')
assert.equal(parseNoteScope('older'), 'older')
assert.equal(parseNoteScope('all'), 'all')

assert.equal(parseNotesLimit(undefined), NOTES_LIST_LIMIT)
assert.equal(parseNotesLimit(''), NOTES_LIST_LIMIT)
assert.equal(parseNotesLimit('0'), NOTES_LIST_LIMIT)
assert.equal(parseNotesLimit(-3), NOTES_LIST_LIMIT)
assert.equal(parseNotesLimit(2), 2)
assert.equal(parseNotesLimit('2'), 2)
assert.equal(parseNotesLimit(999), NOTES_LIST_LIMIT_MAX)

const cutoff = '2026-08-03T00:00:00.000Z'
const taskRecent = notesTaskWhere({
  q: '',
  project: '',
  priority: '',
  scope: 'recent',
  cutoffIso: cutoff,
})
assert.ok(taskRecent.sql.includes('updated_at >= ?'))
assert.deepEqual(taskRecent.params, [cutoff])

const taskSearch = notesTaskWhere({
  q: 'hello',
  project: 'Personal',
  priority: 'High',
  scope: 'older',
  cutoffIso: cutoff,
})
assert.ok(taskSearch.sql.includes('lower(title) LIKE ?'))
assert.ok(taskSearch.sql.includes('project_tag = ?'))
assert.ok(taskSearch.sql.includes('updated_at < ?'))
assert.equal(taskSearch.params.at(-1), cutoff)

const standaloneRecent = notesStandaloneWhere({
  q: '',
  project: '',
  priority: '',
  scope: 'recent',
  cutoffIso: cutoff,
})
assert.ok(standaloneRecent.sql.includes('pinned = 1'))
assert.deepEqual(standaloneRecent.params, [cutoff])

const standaloneOlder = notesStandaloneWhere({
  q: '',
  project: '',
  priority: '',
  scope: 'older',
  cutoffIso: cutoff,
})
assert.ok(standaloneOlder.sql.includes('pinned = 0'))
assert.deepEqual(standaloneOlder.params, [cutoff])

assert.equal(parsePinnedOnly(undefined), false)
assert.equal(parsePinnedOnly('1'), true)
assert.equal(parsePinnedOnly('true'), true)
assert.equal(parsePinnedOnly('pinned'), true)
assert.equal(parsePinnedOnly('0'), false)

const standalonePinned = notesStandaloneWhere({
  q: '',
  project: '',
  priority: '',
  scope: 'all',
  cutoffIso: cutoff,
  pinnedOnly: true,
})
assert.ok(standalonePinned.sql.includes('pinned = 1'))
assert.ok(!standalonePinned.sql.includes('updated_at'))
assert.deepEqual(standalonePinned.params, [])

console.log('notes-list sql tests passed')
