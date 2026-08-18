import type { BlockNoteEditor } from '@blocknote/core'
import { notesToEditorHtml } from './notes-html'

/** Persist empty notes as `''` (matches prior TipTap `ed.isEmpty` behaviour). */
export function notesHtmlForPersist(editor: BlockNoteEditor): string {
  if (editor.isEmpty) return ''
  return editor.blocksToHTMLLossy(editor.document)
}

/**
 * Load stored note HTML (or plain text) into a BlockNote editor.
 * TipTap task-list HTML may become bullets — BlockNote checklist HTML round-trips.
 */
export function loadNotesHtmlIntoEditor(
  editor: BlockNoteEditor,
  raw: string,
): void {
  const html = notesToEditorHtml(raw)
  const blocks = editor.tryParseHTMLToBlocks(html.trim() ? html : '')
  editor.replaceBlocks(editor.document, blocks)
}
