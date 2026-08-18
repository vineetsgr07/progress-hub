import { useEffect, useRef, useState } from 'react'
import { NotesEditor } from './NotesEditor'
import { NOTES_AUTOSAVE_MS } from './notes-copy'
import { focusCopy } from './focus-copy'

type Props = {
  taskId: string
  notesHtml: string
  busy?: boolean
  onSave: (taskId: string, html: string) => Promise<void> | void
}

/**
 * Per-task notes surface. Parent should remount with `key={taskId}` so the
 * editor never boots with the previous task's draft.
 */
export function FocusNotes({ taskId, notesHtml, busy, onSave }: Props) {
  const [draft, setDraft] = useState(notesHtml)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const timerRef = useRef<number | null>(null)
  const draftRef = useRef(notesHtml)
  const savedRef = useRef(notesHtml)
  const taskIdRef = useRef(taskId)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave
  taskIdRef.current = taskId

  // Parent sync for this task only — never wipe in-progress typing.
  useEffect(() => {
    if (draftRef.current !== savedRef.current) {
      // Dirty: adopt parent only once it catches up to what we already have.
      if (notesHtml === draftRef.current) savedRef.current = notesHtml
      return
    }
    if (notesHtml === draftRef.current) return
    setDraft(notesHtml)
    draftRef.current = notesHtml
    savedRef.current = notesHtml
    setStatus('idle')
  }, [notesHtml])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  // Flush dirty notes when leaving this task (parent remounts via key).
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (draftRef.current !== savedRef.current) {
        void onSaveRef.current(taskIdRef.current, draftRef.current)
      }
    }
  }, [])

  async function persist(forTaskId: string, next: string) {
    if (forTaskId === taskIdRef.current && next === savedRef.current) return
    if (forTaskId === taskIdRef.current) setStatus('saving')
    try {
      await onSaveRef.current(forTaskId, next)
      if (forTaskId === taskIdRef.current) {
        // Only mark saved if the user hasn't typed further.
        if (draftRef.current === next) {
          savedRef.current = next
          setStatus('saved')
          window.setTimeout(() => {
            if (taskIdRef.current === forTaskId && draftRef.current === next) {
              setStatus('idle')
            }
          }, 1200)
        } else {
          setStatus('idle')
        }
      }
    } catch {
      if (forTaskId === taskIdRef.current) setStatus('error')
    }
  }

  function scheduleSave(next: string) {
    const id = taskIdRef.current
    setDraft(next)
    draftRef.current = next
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void persist(id, next)
    }, NOTES_AUTOSAVE_MS)
  }

  return (
    <section className="focus-notes" aria-label={focusCopy.notesLabel}>
      <span className="focus-notes-status" aria-live="polite">
        {status === 'saving'
          ? focusCopy.notesSaving
          : status === 'saved'
            ? focusCopy.notesSaved
            : status === 'error'
              ? focusCopy.notesError
              : ''}
      </span>
      <div className="focus-notes-editor">
        <NotesEditor
          content={draft}
          focusKey={taskId}
          autoFocus={false}
          editable={!busy}
          onChange={scheduleSave}
          onBlur={() => void persist(taskIdRef.current, draftRef.current)}
        />
      </div>
    </section>
  )
}
