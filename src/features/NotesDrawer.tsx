import {
  ActionIcon,
  Button,
  Select,
  TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Priority } from '../types'
import { NotesEditor } from './NotesEditor'
import {
  NOTES_AUTOSAVE_MS,
  NOTES_DRAWER_WIDTH_NUDGE,
  NARROW_MAX_WIDTH,
  clampNotesDrawerWidth,
  notesCopy,
  writeNotesDrawerWidth,
} from './notes-copy'
import { notesListCopy, type NotesSubject } from './notes-list'
import { MOTION_BASE_MS, prefersReducedMotion } from './motion'
import { RowMeta } from './RowMeta'
import { PRIORITY_TAGS } from './tags'
import { useTagColors } from './TagColorsContext'
import { STATUS_OPTIONS, isTaskStatus, statusSwatch } from './status-ui'
import { taskCopy } from './task-copy'

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type DetailMetaPatch = {
  title?: string
  projectTag?: string
  priority?: Priority
  category?: string
  cadenceWeekday?: number | null
  cadenceMonthDay?: number | null
  status?: 'todo' | 'doing' | 'done'
}

type Props = {
  subject: NotesSubject
  width: number
  onWidthChange: (width: number) => void
  busy?: boolean
  onClose: () => void
  onSave: (bodyHtml: string) => Promise<void>
  onMetaChange?: (meta: DetailMetaPatch) => Promise<void>
  onDelete?: () => void
  focusTitle?: boolean
  /** Default right so the main list stays visible on the left. */
  side?: 'left' | 'right'
}

const WEEKDAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
]

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => {
  const d = i + 1
  return { value: String(d), label: String(d) }
})

export function NotesDrawer({
  subject,
  width,
  onWidthChange,
  busy,
  onClose,
  onSave,
  onMetaChange,
  onDelete,
  focusTitle,
  side = 'right',
}: Props) {
  const isNarrow = useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`)
  const effectiveWidth = isNarrow ? window.innerWidth : width
  const [draft, setDraft] = useState(subject.body || '')
  const [baseline, setBaseline] = useState(subject.body || '')
  const [title, setTitle] = useState(subject.title || '')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [resizing, setResizing] = useState(false)
  const [open, setOpen] = useState(() => prefersReducedMotion())
  const closingRef = useRef(false)
  const closedRef = useRef(false)
  const exitTimer = useRef<number | null>(null)

  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(width)
  const latestWidth = useRef(width)
  const draftRef = useRef(draft)
  const baselineRef = useRef(baseline)
  const statusRef = useRef<SaveStatus>('idle')
  const debounceTimer = useRef<number | null>(null)
  const savedClearTimer = useRef<number | null>(null)
  const saveInFlight = useRef(false)
  const pendingAfterSave = useRef(false)
  const subjectKeyRef = useRef(`${subject.source}:${subject.id}`)

  useEffect(() => {
    latestWidth.current = width
  }, [width])

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    baselineRef.current = baseline
  }, [baseline])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  // Only reset draft when switching subjects — never wipe in-progress typing from parent sync.
  useEffect(() => {
    const key = `${subject.source}:${subject.id}`
    if (subjectKeyRef.current === key) return
    subjectKeyRef.current = key
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    setDraft(subject.body || '')
    setBaseline(subject.body || '')
    setTitle(subject.title || '')
    setStatus('idle')
  }, [subject.id, subject.source, subject.body, subject.title])

  // Sync title from parent when meta updates for the open subject (e.g. after save).
  useEffect(() => {
    const key = `${subject.source}:${subject.id}`
    if (subjectKeyRef.current !== key) return
    setTitle((prev) => (prev === (subject.title || '') ? prev : subject.title || ''))
  }, [subject.id, subject.source, subject.title])

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    if (savedClearTimer.current) {
      window.clearTimeout(savedClearTimer.current)
      savedClearTimer.current = null
    }
  }, [])

  const save = useCallback(
    async (opts?: { force?: boolean }) => {
      const next = draftRef.current
      if (!opts?.force && next === baselineRef.current) return
      if (saveInFlight.current) {
        pendingAfterSave.current = true
        return
      }

      saveInFlight.current = true
      setStatus('saving')
      try {
        await onSave(next)
        if (draftRef.current !== next) {
          setStatus('dirty')
          pendingAfterSave.current = true
        } else {
          setBaseline(next)
          baselineRef.current = next
          setStatus('saved')
          if (savedClearTimer.current) window.clearTimeout(savedClearTimer.current)
          savedClearTimer.current = window.setTimeout(() => {
            if (statusRef.current === 'saved') setStatus('idle')
          }, 2000)
        }
      } catch {
        setStatus('error')
      } finally {
        saveInFlight.current = false
        if (pendingAfterSave.current) {
          pendingAfterSave.current = false
          if (draftRef.current !== baselineRef.current) {
            debounceTimer.current = window.setTimeout(() => {
              void save()
            }, NOTES_AUTOSAVE_MS)
          }
        }
      }
    },
    [onSave],
  )

  const scheduleAutosave = useCallback(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    debounceTimer.current = window.setTimeout(() => {
      void save()
    }, NOTES_AUTOSAVE_MS)
  }, [save])

  function handleDraftChange(html: string) {
    setDraft(html)
    draftRef.current = html
    if (html === baselineRef.current) {
      setStatus(statusRef.current === 'error' ? 'error' : 'idle')
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }
      return
    }
    setStatus('dirty')
    scheduleAutosave()
  }

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOpen(true)
      return
    }
    // Double rAF so the closed transform paints before the open transition.
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setOpen(true))
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current)
    }
  }, [])

  const finishClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    if (exitTimer.current) {
      window.clearTimeout(exitTimer.current)
      exitTimer.current = null
    }
    clearTimers()
    onClose()
  }, [clearTimers, onClose])

  const requestClose = useCallback(async () => {
    if (closingRef.current) return

    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }

    const dirty = draftRef.current !== baselineRef.current
    const needsFlush =
      dirty || statusRef.current === 'error' || statusRef.current === 'saving'

    if (needsFlush) {
      await save({ force: dirty || statusRef.current === 'error' })
      if (draftRef.current !== baselineRef.current || statusRef.current === 'error') {
        if (!window.confirm(notesCopy.discardConfirm)) return
      }
    }

    if (prefersReducedMotion()) {
      finishClose()
      return
    }

    closingRef.current = true
    setOpen(false)
    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null
      finishClose()
    }, MOTION_BASE_MS)
  }, [finishClose, save])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (debounceTimer.current) {
          window.clearTimeout(debounceTimer.current)
          debounceTimer.current = null
        }
        void save({ force: true })
        return
      }
      if (e.key === 'Escape') void requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, requestClose])

  const onSaveRef = useRef(onSave)
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
      if (savedClearTimer.current) window.clearTimeout(savedClearTimer.current)
      if (draftRef.current !== baselineRef.current) {
        void onSaveRef.current(draftRef.current).catch(() => undefined)
      }
    }
  }, [])

  useEffect(() => {
    if (!resizing) return

    function onMove(e: PointerEvent) {
      // Left dock: drag right edge outward (↑x) widens; right dock: drag left edge leftward widens.
      const raw =
        side === 'left'
          ? e.clientX - resizeStartX.current
          : resizeStartX.current - e.clientX
      const next = clampNotesDrawerWidth(resizeStartWidth.current + raw)
      latestWidth.current = next
      onWidthChange(next)
    }

    function onUp() {
      setResizing(false)
      writeNotesDrawerWidth(latestWidth.current)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [resizing, onWidthChange, side])

  function startResize(e: ReactPointerEvent<HTMLButtonElement>) {
    e.preventDefault()
    resizeStartX.current = e.clientX
    resizeStartWidth.current = width
    setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function nudgeWidth(delta: number) {
    const next = clampNotesDrawerWidth(width + delta)
    onWidthChange(next)
    writeNotesDrawerWidth(next)
  }

  function statusLabel() {
    switch (status) {
      case 'dirty':
        return notesCopy.unsaved
      case 'saving':
        return notesCopy.saving
      case 'saved':
        return notesCopy.saved
      case 'error':
        return notesCopy.saveFailed
      default:
        return null
    }
  }

  async function commitTitle() {
    if (!onMetaChange) return
    const next = title.trim()
    if (!next || next === (subject.title || '').trim()) {
      if (!next) setTitle(subject.title || '')
      return
    }
    try {
      await onMetaChange({ title: next })
    } catch {
      setStatus('error')
    }
  }

  const label = statusLabel()
  const isStandalone = subject.source === 'note'
  const isTask = subject.source === 'task'
  const { frequencies, projects, swatchFor } = useTagColors()
  const category = subject.category || 'Daily'
  const projectTag = subject.projectTag || (isStandalone ? 'Personal' : 'Marketing')
  const priority = subject.priority || 'Medium'
  const taskStatus = subject.status || 'todo'

  const frequencyOptions = frequencies.includes(category)
    ? frequencies
    : [...frequencies, category]
  const projectOptions = projects.includes(projectTag)
    ? projects
    : [...projects, projectTag]

  const dialogLabel = isTask ? taskCopy.detailDialogLabel : notesCopy.dialogLabel
  const backdropLabel = isTask ? taskCopy.closeBackdrop : notesCopy.closeBackdrop
  const kicker = isStandalone
    ? notesListCopy.panelTitle
    : taskCopy.detailKicker

  const openClass = open ? ' is-open' : ''

  return (
    <>
      <button
        type="button"
        className={`notes-drawer-backdrop${openClass}`}
        aria-label={backdropLabel}
        onClick={() => void requestClose()}
      />
      <aside
        className={`notes-drawer notes-drawer-${side}${openClass}${resizing ? ' is-resizing' : ''}${isNarrow ? ' is-narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        style={{ width: isNarrow ? '100vw' : `min(${effectiveWidth}px, 100vw)` }}
        onTransitionEnd={(e) => {
          if (
            e.target !== e.currentTarget ||
            e.propertyName !== 'transform' ||
            open ||
            !closingRef.current
          ) {
            return
          }
          if (exitTimer.current) {
            window.clearTimeout(exitTimer.current)
            exitTimer.current = null
          }
          finishClose()
        }}
      >
        {!isNarrow && (
        <button
          type="button"
          className={`notes-drawer-resize notes-drawer-resize-${side}`}
          aria-label={notesCopy.resizeHandle}
          onPointerDown={startResize}
          onKeyDown={(e) => {
            if (side === 'left') {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                nudgeWidth(NOTES_DRAWER_WIDTH_NUDGE)
              }
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                nudgeWidth(-NOTES_DRAWER_WIDTH_NUDGE)
              }
            } else {
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                nudgeWidth(NOTES_DRAWER_WIDTH_NUDGE)
              }
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                nudgeWidth(-NOTES_DRAWER_WIDTH_NUDGE)
              }
            }
          }}
        />
        )}
        <header className="notes-drawer-header">
          <div className="notes-drawer-header-main">
            <p className="notes-drawer-kicker">{kicker}</p>
            <TextInput
              variant="unstyled"
              className="notes-drawer-title-input"
              value={title}
              placeholder={
                isStandalone ? notesListCopy.titlePlaceholder : taskCopy.titlePlaceholder
              }
              onChange={(e) => setTitle(e.currentTarget.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  ;(e.currentTarget as HTMLInputElement).blur()
                }
              }}
              autoFocus={focusTitle}
              disabled={busy || !onMetaChange}
            />
            {onMetaChange && (
              <div className="notes-drawer-meta">
                {isTask && (
                  <RowMeta
                    value={category}
                    options={frequencyOptions.map((value) => ({
                      value,
                      label: value,
                      swatch: swatchFor('category', value),
                    }))}
                    swatch={swatchFor('category', category)}
                    onSelect={(value) => {
                      const patch: DetailMetaPatch = { category: value }
                      if (value === 'Weekly') {
                        patch.cadenceWeekday = subject.cadenceWeekday ?? 5
                        patch.cadenceMonthDay = null
                      } else if (value === 'Monthly') {
                        patch.cadenceMonthDay = subject.cadenceMonthDay ?? 1
                        patch.cadenceWeekday = null
                      } else {
                        patch.cadenceWeekday = null
                        patch.cadenceMonthDay = null
                      }
                      void onMetaChange(patch)
                    }}
                    ariaLabel={taskCopy.frequency}
                    disabled={busy}
                  />
                )}
                <RowMeta
                  value={projectTag}
                  options={projectOptions.map((value) => ({
                    value,
                    label: value,
                    swatch: swatchFor('project', value),
                  }))}
                  swatch={swatchFor('project', projectTag)}
                  onSelect={(value) => void onMetaChange({ projectTag: value })}
                  ariaLabel={
                    isStandalone ? notesListCopy.filterProject : taskCopy.project
                  }
                  disabled={busy}
                />
                <RowMeta
                  value={priority}
                  options={PRIORITY_TAGS.map((value) => ({
                    value,
                    label: value,
                    swatch: swatchFor('priority', value),
                  }))}
                  swatch={swatchFor('priority', priority)}
                  onSelect={(value) =>
                    void onMetaChange({ priority: value as Priority })
                  }
                  ariaLabel={
                    isStandalone ? notesListCopy.filterPriority : taskCopy.priority
                  }
                  disabled={busy}
                />
                {isTask && (
                  <RowMeta
                    value={taskStatus}
                    options={STATUS_OPTIONS}
                    swatch={statusSwatch(taskStatus)}
                    onSelect={(value) => {
                      if (!isTaskStatus(value)) return
                      void onMetaChange({ status: value })
                    }}
                    ariaLabel={taskCopy.status}
                    disabled={busy}
                  />
                )}
              </div>
            )}
            {isTask && onMetaChange && category === 'Weekly' && (
              <Select
                className="notes-drawer-cadence"
                label={taskCopy.cadenceWeekday}
                data={WEEKDAYS}
                value={String(subject.cadenceWeekday ?? 5)}
                onChange={(v) =>
                  v && void onMetaChange({ cadenceWeekday: Number(v) })
                }
                size="xs"
                w={200}
                disabled={busy}
              />
            )}
            {isTask && onMetaChange && category === 'Monthly' && (
              <Select
                className="notes-drawer-cadence"
                label={taskCopy.cadenceMonthDay}
                data={MONTH_DAYS}
                value={String(subject.cadenceMonthDay ?? 1)}
                onChange={(v) =>
                  v && void onMetaChange({ cadenceMonthDay: Number(v) })
                }
                size="xs"
                w={200}
                disabled={busy}
              />
            )}
            {label && (
              <p
                className={`notes-drawer-status status-${status}`}
                role="status"
                aria-live="polite"
              >
                {label}
              </p>
            )}
          </div>
          <ActionIcon
            variant="subtle"
            aria-label={notesCopy.close}
            onClick={() => void requestClose()}
          >
            ×
          </ActionIcon>
        </header>
        <div className="notes-drawer-body">
          <NotesEditor
            content={draft}
            onChange={handleDraftChange}
            editable={!busy}
            autoFocus={!focusTitle}
            focusKey={`${subject.source}:${subject.id}`}
            onBlur={() => {
              if (draftRef.current !== baselineRef.current) {
                if (debounceTimer.current) {
                  window.clearTimeout(debounceTimer.current)
                  debounceTimer.current = null
                }
                void save()
              }
            }}
          />
        </div>
        <footer className="notes-drawer-footer">
          {isTask && onDelete && (
            <Button
              variant="subtle"
              color="red"
              disabled={busy}
              onClick={onDelete}
            >
              {taskCopy.deleteTask}
            </Button>
          )}
          <div className="notes-drawer-footer-end">
            <Button variant="default" onClick={() => void requestClose()}>
              {notesCopy.close}
            </Button>
            {status === 'error' && (
              <Button
                color="dark"
                disabled={busy}
                onClick={() => void save({ force: true })}
              >
                {notesCopy.retry}
              </Button>
            )}
          </div>
        </footer>
      </aside>
    </>
  )
}
