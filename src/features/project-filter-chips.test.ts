import assert from 'node:assert/strict'
import { NOTES_PROJECT_ALL, notesListCopy } from './notes-list.ts'

assert.equal(NOTES_PROJECT_ALL, 'All')
assert.equal(notesListCopy.sourceAll, NOTES_PROJECT_ALL)
assert.equal(notesListCopy.filterProject, 'Project')

console.log('project-filter-chips.test.ts: ok')
