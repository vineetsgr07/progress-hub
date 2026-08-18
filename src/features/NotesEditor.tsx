import { useEffect, useRef } from 'react'
import { useMantineColorScheme } from '@mantine/core'
import { en } from '@blocknote/core/locales'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import { notesCopy } from './notes-copy'
import {
  loadNotesHtmlIntoEditor,
  notesHtmlForPersist,
} from './notes-blocknote'
import {
  isNewlyCheckedChecklist,
  moveCheckedChecklistToBottomOfRun,
  type CheckListBlockLike,
} from './notes-checklist-order'

type Props = {
  content: string
  onChange: (html: string) => void
  editable?: boolean
  onBlur?: () => void
  /** Focus the caret when this key changes (typically task id). */
  focusKey?: string
  autoFocus?: boolean
  /** Optional override; omit to use BlockNote’s default placeholders. */
  placeholder?: string
  /** Accessible name for the editor surface. */
  ariaLabel?: string
  className?: string
}

function NotesBlockNote({
  content,
  onChange,
  editable = true,
  onBlur,
  autoFocus = true,
  placeholder,
  ariaLabel = notesCopy.editorLabel,
  className,
}: Props) {
  const { colorScheme } = useMantineColorScheme()
  const readyRef = useRef(false)
  const reorderingRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const editor = useCreateBlockNote({
    animations: false,
    autofocus: false,
    defaultStyles: true,
    ...(placeholder
      ? {
          dictionary: {
            ...en,
            placeholders: {
              ...en.placeholders,
              default: placeholder,
              emptyDocument: placeholder,
            },
          },
        }
      : {}),
    domAttributes: {
      editor: {
        'aria-label': ariaLabel,
      },
    },
  })

  useEffect(() => {
    readyRef.current = false
    loadNotesHtmlIntoEditor(editor, content)
    readyRef.current = true
    if (autoFocus && editable) {
      const id = window.setTimeout(() => {
        editor.focus()
      }, 0)
      return () => window.clearTimeout(id)
    }
    return undefined
    // Remount via focusKey on the outer wrapper; load once per editor instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount load
  }, [editor])

  return (
    <div className={className ? `notes-editor ${className}` : 'notes-editor'}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={colorScheme === 'dark' ? 'dark' : 'light'}
        className="notes-blocknote"
        onChange={(_ed, ctx) => {
          if (!readyRef.current) return
          if (!reorderingRef.current) {
            for (const change of ctx.getChanges()) {
              if (change.type !== 'update') continue
              if (
                !isNewlyCheckedChecklist(
                  change.prevBlock as CheckListBlockLike,
                  change.block as CheckListBlockLike,
                )
              ) {
                continue
              }
              reorderingRef.current = true
              try {
                moveCheckedChecklistToBottomOfRun(
                  {
                    getBlock: (id) =>
                      editor.getBlock(id) as CheckListBlockLike | undefined,
                    getNextBlock: (id) =>
                      editor.getNextBlock(id) as CheckListBlockLike | undefined,
                    moveBlocksDown: (id) => editor.moveBlocksDown(id),
                  },
                  change.block.id,
                )
              } finally {
                reorderingRef.current = false
              }
              break
            }
          }
          onChangeRef.current(notesHtmlForPersist(editor))
        }}
        onBlur={() => {
          onBlur?.()
        }}
      />
    </div>
  )
}

/** BlockNote notes editor — remounts when `focusKey` changes (per-task content). */
export function NotesEditor(props: Props) {
  return <NotesBlockNote key={props.focusKey ?? 'notes'} {...props} />
}
