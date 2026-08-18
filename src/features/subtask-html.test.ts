import assert from 'node:assert/strict'
import {
  sanitizeSubtaskHtml,
  subtaskDisplayHtml,
  subtaskEditableText,
  subtaskPlainText,
} from './subtask-html.ts'

assert.equal(subtaskPlainText(''), '')
assert.equal(subtaskPlainText('<strong>Hi</strong> there'), 'Hi there')
assert.equal(subtaskPlainText('a<br>b'), 'a b')
assert.equal(subtaskPlainText('Tom &amp; Jerry'), 'Tom & Jerry')
assert.equal(subtaskPlainText('R&amp;amp;D'), 'R&D')
assert.equal(subtaskPlainText('A &#38; B'), 'A & B')

assert.equal(subtaskEditableText(''), '')
assert.equal(subtaskEditableText('a<br>b'), 'a\nb')
assert.equal(subtaskEditableText('a<br/>b<br>c'), 'a\nb\nc')
assert.equal(subtaskEditableText('<strong>Hi</strong>\nthere'), 'Hi\nthere')
assert.equal(subtaskEditableText('line1\nline2'), 'line1\nline2')
assert.equal(subtaskEditableText('<div>one</div><div>two</div>'), 'one\ntwo')
assert.equal(subtaskEditableText('Q&amp;A'), 'Q&A')

assert.equal(sanitizeSubtaskHtml('plain'), 'plain')
assert.equal(sanitizeSubtaskHtml('a < b'), 'a &lt; b')
assert.equal(sanitizeSubtaskHtml('Tom & Jerry'), 'Tom &amp; Jerry')
assert.equal(sanitizeSubtaskHtml('Tom &amp; Jerry'), 'Tom &amp; Jerry')
assert.equal(sanitizeSubtaskHtml('R&amp;amp;D'), 'R&amp;D')
assert.equal(sanitizeSubtaskHtml('line1\nline2'), 'line1<br>line2')
assert.equal(
  sanitizeSubtaskHtml('<strong>Bold</strong> and <u>under</u>'),
  '<strong>Bold</strong> and <u>under</u>',
)
assert.equal(
  sanitizeSubtaskHtml('<strong>A &amp; B</strong>'),
  '<strong>A &amp; B</strong>',
)
assert.equal(
  sanitizeSubtaskHtml('<em>Italic</em> and <i>also</i>'),
  '<em>Italic</em> and <em>also</em>',
)
assert.equal(
  sanitizeSubtaskHtml('<b>B</b><script>x</script>'),
  '<strong>B</strong>x',
)
assert.equal(
  sanitizeSubtaskHtml('<span class="subtask-size-lg">Big</span>'),
  '<span class="subtask-size-lg">Big</span>',
)
assert.equal(
  sanitizeSubtaskHtml('<span onclick="alert(1)">nope</span>'),
  'nope',
)
assert.equal(subtaskDisplayHtml('hello\nworld'), 'hello<br>world')
assert.equal(subtaskDisplayHtml('Q & A'), 'Q &amp; A')
assert.equal(subtaskDisplayHtml('Q &amp; A'), 'Q &amp; A')
assert.equal(
  subtaskDisplayHtml('<strong>Ok</strong>'),
  '<strong>Ok</strong>',
)

console.log('subtask-html tests passed')
