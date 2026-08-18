import assert from 'node:assert/strict'
import { notesPreviewText, notesToEditorHtml } from './notes-html.ts'

assert.equal(notesToEditorHtml(''), '')
assert.equal(notesToEditorHtml('   '), '')
assert.equal(notesToEditorHtml('hello'), '<p>hello</p>')
assert.equal(notesToEditorHtml('a\n\nb'), '<p>a</p><p>b</p>')
assert.equal(notesToEditorHtml('line1\nline2'), '<p>line1<br>line2</p>')
assert.equal(notesToEditorHtml('<p>already</p>'), '<p>already</p>')
assert.equal(notesToEditorHtml('a < b'), '<p>a &lt; b</p>')
assert.equal(notesPreviewText('<p>Hello <strong>world</strong></p>'), 'Hello world')
assert.equal(notesPreviewText('<p>' + 'x'.repeat(100) + '</p>').endsWith('…'), true)

console.log('notes-html tests passed')
