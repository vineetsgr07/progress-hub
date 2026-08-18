import assert from 'node:assert/strict'
import { installNotesTestDom } from './notes-blocknote-dom.ts'

installNotesTestDom()

const { BlockNoteEditor } = await import('@blocknote/core')
const { loadNotesHtmlIntoEditor, notesHtmlForPersist } = await import(
  './notes-blocknote.ts'
)

function withEditor(run: (editor: InstanceType<typeof BlockNoteEditor>) => void) {
  const editor = BlockNoteEditor.create()
  run(editor)
}

withEditor((editor) => {
  loadNotesHtmlIntoEditor(editor, '')
  assert.equal(notesHtmlForPersist(editor), '')
  assert.equal(editor.isEmpty, true)
})

withEditor((editor) => {
  loadNotesHtmlIntoEditor(editor, 'hello')
  const html = notesHtmlForPersist(editor)
  assert.match(html, /hello/)
  assert.equal(editor.isEmpty, false)
})

withEditor((editor) => {
  loadNotesHtmlIntoEditor(editor, '<p>Hello <strong>world</strong></p>')
  assert.equal(notesHtmlForPersist(editor), '<p>Hello <strong>world</strong></p>')
})

withEditor((editor) => {
  loadNotesHtmlIntoEditor(editor, '<h1>Title</h1><p>body</p>')
  const html = notesHtmlForPersist(editor)
  assert.match(html, /<h1>Title<\/h1>/)
  assert.match(html, /body/)
})

withEditor((editor) => {
  loadNotesHtmlIntoEditor(editor, '<ul><li>a</li><li>b</li></ul>')
  const html = notesHtmlForPersist(editor)
  assert.match(html, /<ul>/)
  assert.match(html, />a</)
  assert.match(html, />b</)
})

withEditor((editor) => {
  editor.replaceBlocks(editor.document, [
    {
      type: 'checkListItem',
      content: 'todo item',
      props: { checked: false },
    },
    {
      type: 'checkListItem',
      content: 'done item',
      props: { checked: true },
    },
  ])
  const html = notesHtmlForPersist(editor)
  loadNotesHtmlIntoEditor(editor, html)
  const types = editor.document.map((b) => b.type)
  assert.deepEqual(types, ['checkListItem', 'checkListItem'])
  assert.equal(
    (editor.document[1] as { props: { checked: boolean } }).props.checked,
    true,
  )
})

console.log('notes-blocknote tests passed')
