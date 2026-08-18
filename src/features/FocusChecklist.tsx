import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconGripVertical, IconPlayerPlay, IconPlayerStop, IconX } from '@tabler/icons-react'
import type { Subtask } from '../types'
import { formatDuration } from '../utils/date'
import { sortFocusChecklist, visibleChecklist, partitionChecklist } from './focus-checklist'
import { focusCopy } from './focus-copy'
import {
  sanitizeSubtaskHtml,
  subtaskDisplayHtml,
  subtaskPlainText,
} from './subtask-html'

const ICON = { size: 14, stroke: 2 } as const

type Props = {
  items: Subtask[]
  activeTimerSubtaskId?: string | null
  timerStartedAt?: string | null
  tick?: number
  busy?: boolean
  onToggle: (subtaskId: string, done: boolean) => void
  onRename: (subtaskId: string, title: string) => void
  onAdd: (
    title: string,
    opts?: { afterId?: string },
  ) => void | Promise<string | void>
  onDelete: (subtaskId: string) => void
  onStartTimer: (subtaskId: string) => void
  onStopTimer: () => void
  onReorder: (orderedIds: string[]) => Promise<void>
}

export function FocusChecklist({
  items: subtasks,
  activeTimerSubtaskId,
  timerStartedAt,
  tick = 0,
  busy,
  onToggle,
  onRename,
  onAdd,
  onDelete,
  onStartTimer,
  onStopTimer,
  onReorder,
}: Props) {
  const [draft, setDraft] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [items, setItems] = useState(() => sortFocusChecklist(subtasks))
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    setItems(sortFocusChecklist(subtasks))
  }, [subtasks])

  useEffect(() => {
    if (!pendingFocusId) return
    if (!items.some((s) => s.id === pendingFocusId)) return
    const id = pendingFocusId
    setPendingFocusId(null)
    const frame = window.requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(
        `[data-subtask-id="${id}"]`,
      )
      const el = row?.querySelector(
        '.focus-checklist-title',
      ) as HTMLElement | null
      el?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [items, pendingFocusId])

  const { done: doneItems } = partitionChecklist(items)
  const visible = visibleChecklist(items, showDone)

  function handleToggle(subtaskId: string, done: boolean) {
    setItems((prev) =>
      sortFocusChecklist(
        prev.map((s) => (s.id === subtaskId ? { ...s, done } : s)),
      ),
    )
    onToggle(subtaskId, done)
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || busy) return

    const oldIndex = visible.findIndex((s) => s.id === active.id)
    const newIndex = visible.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reorderedVisible = arrayMove(visible, oldIndex, newIndex).map(
      (s, i) => ({
        ...s,
        position: i,
      }),
    )
    const merged = showDone
      ? reorderedVisible
      : [...reorderedVisible, ...doneItems]
    const next = sortFocusChecklist(
      merged.map((s, i) => ({ ...s, position: i })),
    )
    setItems(next)
    try {
      await onReorder(next.map((s) => s.id))
    } catch {
      setItems(sortFocusChecklist(subtasks))
    }
  }

  function submitAdd() {
    const title = draft.trim()
    if (!title || busy) return
    void onAdd(title)
    setDraft('')
  }

  async function addBelow(afterId: string) {
    if (busy) return
    const id = await onAdd('', { afterId })
    if (typeof id === 'string' && id) setPendingFocusId(id)
  }

  return (
    <section className="focus-checklist" aria-label={focusCopy.checklistLabel}>
      <h2 className="focus-panel-title">{focusCopy.checklistLabel}</h2>
      {items.length === 0 ? (
        <p className="focus-checklist-empty">{focusCopy.checklistEmpty}</p>
      ) : (
        <div className="focus-checklist-body">
          {visible.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => void onDragEnd(e)}
            >
              <SortableContext
                items={visible.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="focus-checklist-list" ref={listRef}>
                  {visible.map((s) => {
                    const timing = activeTimerSubtaskId === s.id
                    return (
                      <FocusChecklistRow
                        key={s.id}
                        subtask={s}
                        timing={timing}
                        hours={liveSubtaskHours(
                          s,
                          timerStartedAt,
                          activeTimerSubtaskId,
                          tick,
                        )}
                        busy={busy}
                        onToggle={handleToggle}
                        onRename={onRename}
                        onDelete={onDelete}
                        onStartTimer={onStartTimer}
                        onStopTimer={onStopTimer}
                        onAddBelow={() => void addBelow(s.id)}
                      />
                    )
                  })}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="focus-checklist-list is-empty" aria-hidden />
          )}
          {doneItems.length > 0 && (
            <button
              type="button"
              className="checklist-done-toggle"
              aria-expanded={showDone}
              aria-label={
                showDone ? focusCopy.hideDoneAria : focusCopy.showDoneAria
              }
              onClick={() => {
                setShowDone((prev) => {
                  const next = !prev
                  if (prev) {
                    // Hiding done — keep open items in view (don't leave scroll
                    // stuck where done items were).
                    window.requestAnimationFrame(() => {
                      listRef.current?.scrollTo({ top: 0 })
                    })
                  }
                  return next
                })
              }}
            >
              {showDone
                ? focusCopy.hideDone
                : focusCopy.showDone(doneItems.length)}
            </button>
          )}
        </div>
      )}

      <div className="focus-checklist-add">
        <input
          type="text"
          className="focus-checklist-add-input"
          value={draft}
          disabled={busy}
          placeholder={focusCopy.addPlaceholder}
          aria-label={focusCopy.addItem}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submitAdd()
            }
          }}
        />
        <button
          type="button"
          className="focus-checklist-add-btn"
          disabled={busy || !draft.trim()}
          onClick={submitAdd}
        >
          {focusCopy.addItem}
        </button>
      </div>
    </section>
  )
}

function liveSubtaskHours(
  subtask: Subtask,
  timerStartedAt: string | null | undefined,
  timerSubtaskId: string | null | undefined,
  tick: number,
) {
  void tick
  const base = subtask.hours ?? 0
  if (!timerStartedAt || timerSubtaskId !== subtask.id) return base
  const started = new Date(timerStartedAt).getTime()
  if (!Number.isFinite(started)) return base
  return base + (Date.now() - started) / 3_600_000
}

function FocusChecklistRow({
  subtask: s,
  timing,
  hours,
  busy,
  onToggle,
  onRename,
  onDelete,
  onStartTimer,
  onStopTimer,
  onAddBelow,
}: {
  subtask: Subtask
  timing: boolean
  hours: number
  busy?: boolean
  onToggle: (subtaskId: string, done: boolean) => void
  onRename: (subtaskId: string, title: string) => void
  onDelete: (subtaskId: string) => void
  onStartTimer: (subtaskId: string) => void
  onStopTimer: () => void
  onAddBelow: () => void
}) {
  const plain = subtaskPlainText(s.title) || s.title
  const displayHtml = subtaskDisplayHtml(s.title)
  const editorRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id, disabled: Boolean(busy) })
  const hoursLabel = formatDuration(hours)
  const showTimerControl = timing || !s.done
  const showTimeUnderIcon = timing || hours > 0

  useEffect(() => {
    const el = editorRef.current
    if (!el || focusedRef.current) return
    const next = displayHtml || ''
    if (el.innerHTML !== next) el.innerHTML = next
  }, [displayHtml])

  function commit() {
    const html = sanitizeSubtaskHtml(editorRef.current?.innerHTML || '')
    const nextPlain = subtaskPlainText(html)
    if (!nextPlain) {
      // Allow empty titles (new Enter-created rows); still sync if changed.
      if (html !== s.title) onRename(s.id, html)
      return
    }
    if (html !== s.title) onRename(s.id, html)
  }

  function runFormat(command: 'bold' | 'italic' | 'underline') {
    const el = editorRef.current
    if (!el || busy) return
    el.focus()
    document.execCommand(command)
  }

  return (
    <li
      ref={setNodeRef}
      data-subtask-id={s.id}
      className={`focus-checklist-row${s.done ? ' is-done' : ''}${timing ? ' is-timing' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
    >
      <button
        type="button"
        className="list-drag-handle subtask-drag-handle focus-checklist-drag"
        aria-label={focusCopy.dragAria(plain || 'item')}
        disabled={busy}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical {...ICON} aria-hidden />
      </button>
      <input
        type="checkbox"
        className="focus-checklist-check"
        checked={s.done}
        disabled={busy}
        aria-label={
          s.done
            ? `${focusCopy.markNotDone}: ${plain}`
            : `${focusCopy.markDone}: ${plain}`
        }
        onChange={(e) => onToggle(s.id, e.currentTarget.checked)}
      />
      <div className="focus-checklist-title-wrap">
        <div
          ref={editorRef}
          className="focus-checklist-title"
          contentEditable={!busy}
          role="textbox"
          aria-multiline="true"
          aria-label={focusCopy.editItem}
          title={focusCopy.formatHint}
          suppressContentEditableWarning
          onFocus={() => {
            focusedRef.current = true
          }}
          onBlur={() => {
            focusedRef.current = false
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) {
                document.execCommand('insertLineBreak')
                return
              }
              commit()
              onAddBelow()
              return
            }
            const mod = e.metaKey || e.ctrlKey
            if (!mod) return
            const key = e.key.toLowerCase()
            if (key === 'b') {
              e.preventDefault()
              runFormat('bold')
            } else if (key === 'i') {
              e.preventDefault()
              runFormat('italic')
            } else if (key === 'u') {
              e.preventDefault()
              runFormat('underline')
            }
          }}
        />
      </div>
      <div className="focus-checklist-actions">
        {showTimerControl ? (
          <div
            className={`focus-checklist-timer${timing ? ' is-live' : ''}`}
          >
            {showTimeUnderIcon ? (
              <span
                className="focus-checklist-timer-time"
                aria-live={timing ? 'polite' : undefined}
                title={`${focusCopy.timeSpent}: ${hoursLabel}`}
              >
                {hoursLabel}
              </span>
            ) : null}
            <button
              type="button"
              className={`focus-checklist-timer-btn${timing ? ' is-stop' : ''}`}
              disabled={busy}
              aria-label={timing ? focusCopy.stopOnItem : focusCopy.startOnItem}
              title={timing ? focusCopy.stopOnItem : focusCopy.startOnItem}
              onClick={() => {
                if (timing) onStopTimer()
                else onStartTimer(s.id)
              }}
            >
              {timing ? (
                <IconPlayerStop {...ICON} aria-hidden />
              ) : (
                <IconPlayerPlay {...ICON} aria-hidden />
              )}
            </button>
          </div>
        ) : hours > 0 ? (
          <span
            className="focus-checklist-timer-time is-solo"
            title={`${focusCopy.timeSpent}: ${hoursLabel}`}
          >
            {hoursLabel}
          </span>
        ) : null}
        <button
          type="button"
          className="focus-checklist-delete"
          disabled={busy}
          aria-label={`${focusCopy.deleteItem}: ${plain}`}
          title={focusCopy.deleteItem}
          onClick={() => onDelete(s.id)}
        >
          <IconX {...ICON} aria-hidden />
        </button>
      </div>
    </li>
  )
}
