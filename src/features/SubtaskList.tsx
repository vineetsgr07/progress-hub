import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
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
import { ActionIcon, Checkbox, TextInput } from '@mantine/core'
import { IconGripVertical, IconPlus, IconX } from '@tabler/icons-react'
import type { Subtask } from '../types'
import { partitionChecklist, visibleChecklist } from './focus-checklist'
import { taskCopy } from './task-copy'
import { TimeControl } from './TimeControl'
import {
  sanitizeSubtaskHtml,
  subtaskDisplayHtml,
  subtaskPlainText,
} from './subtask-html'
import {
  TASK_MOUSE_SENSOR_OPTIONS,
  TASK_TOUCH_SENSOR_OPTIONS,
  TaskMouseSensor,
  TaskTouchSensor,
} from './drag-sensors'

const ICON = { size: 14, stroke: 1.5 } as const

type Props = {
  taskId: string
  subtasks: Subtask[]
  busy?: boolean
  /** Focus the “add item” field when the panel opens empty. */
  autoFocusAdd?: boolean
  /** Show checklist timers (Today view). */
  showTimers?: boolean
  timerSubtaskId?: string | null
  timerStartedAt?: string | null
  tick?: number
  onToggle: (id: string, done: boolean) => void
  onAdd: (title: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onReorder: (orderedIds: string[]) => Promise<void>
  onToggleTimer?: (subtaskId: string, action: 'start' | 'stop') => void
}

export function SubtaskList({
  subtasks,
  busy,
  autoFocusAdd,
  showTimers,
  timerSubtaskId,
  timerStartedAt,
  tick = 0,
  onToggle,
  onAdd,
  onRename,
  onDelete,
  onReorder,
  onToggleTimer,
}: Props) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [items, setItems] = useState(subtasks)
  const addRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(
    useSensor(TaskMouseSensor, TASK_MOUSE_SENSOR_OPTIONS),
    useSensor(TaskTouchSensor, TASK_TOUCH_SENSOR_OPTIONS),
  )

  useEffect(() => {
    setItems(subtasks)
  }, [subtasks])

  useEffect(() => {
    if (!autoFocusAdd) return
    const id = window.setTimeout(() => addRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [autoFocusAdd])

  const { done: doneItems } = partitionChecklist(items)
  const visible = visibleChecklist(items, showDone)

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = visible.findIndex((s) => s.id === active.id)
    const newIndex = visible.findIndex((s) => s.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reorderedVisible = arrayMove(visible, oldIndex, newIndex).map(
      (s, i) => ({
        ...s,
        position: i,
      }),
    )
    const next = showDone
      ? reorderedVisible
      : [
          ...reorderedVisible,
          ...doneItems.map((s, i) => ({
            ...s,
            position: reorderedVisible.length + i,
          })),
        ]
    setItems(next)
    try {
      await onReorder(next.map((s) => s.id))
    } catch {
      setItems(subtasks)
    }
  }

  function commitAdd() {
    if (!draft.trim() || busy) return
    onAdd(draft.trim())
    setDraft('')
  }

  return (
    <div className="subtask-panel">
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
            <ul className="subtask-list">
              {visible.map((s) => (
                <SortableSubtaskRow
                  key={s.id}
                  subtask={s}
                  busy={busy}
                  editing={editingId === s.id}
                  setEditingId={setEditingId}
                  onToggle={onToggle}
                  onRename={onRename}
                  onDelete={onDelete}
                  showTimers={showTimers}
                  running={
                    Boolean(timerStartedAt) && timerSubtaskId === s.id
                  }
                  hours={liveSubtaskHours(
                    s,
                    timerStartedAt,
                    timerSubtaskId,
                    tick,
                  )}
                  onToggleTimer={onToggleTimer}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
      {doneItems.length > 0 && (
        <button
          type="button"
          className="checklist-done-toggle"
          aria-expanded={showDone}
          aria-label={
            showDone
              ? taskCopy.checklistHideDoneAria
              : taskCopy.checklistShowDoneAria
          }
          onClick={() => setShowDone((v) => !v)}
        >
          {showDone
            ? taskCopy.checklistHideDone
            : taskCopy.checklistShowDone(doneItems.length)}
        </button>
      )}
      <div className="subtask-add">
        <TextInput
          ref={addRef}
          placeholder="+ Add checklist item"
          size="xs"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitAdd()
            }
          }}
          style={{ flex: 1 }}
        />
        <ActionIcon
          variant="subtle"
          size="sm"
          aria-label="Add checklist item"
          disabled={busy || !draft.trim()}
          onClick={commitAdd}
        >
          <IconPlus {...ICON} />
        </ActionIcon>
      </div>
    </div>
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

function SortableSubtaskRow({
  subtask: s,
  busy,
  editing,
  setEditingId,
  onToggle,
  onRename,
  onDelete,
  showTimers,
  running,
  hours,
  onToggleTimer,
}: {
  subtask: Subtask
  busy?: boolean
  editing: boolean
  setEditingId: (id: string | null) => void
  onToggle: (id: string, done: boolean) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  showTimers?: boolean
  running?: boolean
  hours?: number
  onToggleTimer?: (subtaskId: string, action: 'start' | 'stop') => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: s.id })
  const editorRef = useRef<HTMLDivElement>(null)
  const skipBlurCommit = useRef(false)
  const plain = subtaskPlainText(s.title)

  useEffect(() => {
    if (!editing || !editorRef.current) return
    editorRef.current.innerHTML = subtaskDisplayHtml(s.title) || ''
    editorRef.current.focus()
    const sel = window.getSelection()
    if (sel && editorRef.current.childNodes.length) {
      sel.selectAllChildren(editorRef.current)
      sel.collapseToEnd()
    }
  }, [editing, s.title, s.id])

  function commitRename() {
    if (skipBlurCommit.current) {
      skipBlurCommit.current = false
      return
    }
    const html = sanitizeSubtaskHtml(editorRef.current?.innerHTML || '')
    const nextPlain = subtaskPlainText(html)
    if (nextPlain && html !== s.title) {
      onRename(s.id, html)
    }
    setEditingId(null)
  }

  function runFormat(command: 'bold' | 'italic' | 'underline' | 'larger') {
    const el = editorRef.current
    if (!el) return
    el.focus()
    if (command === 'bold' || command === 'italic' || command === 'underline') {
      document.execCommand(command)
      return
    }
    // Larger: wrap selection in size span (toggle by execCommand insertHTML)
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const span = document.createElement('span')
    span.className = 'subtask-size-lg'
    try {
      range.surroundContents(span)
    } catch {
      // Selection spans partial nodes — fall back to insertHTML
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }
    sel.removeAllRanges()
    const after = document.createRange()
    after.selectNodeContents(span)
    after.collapse(false)
    sel.addRange(after)
  }

  return (
    <li
      ref={setNodeRef}
      className={`subtask-row${s.done ? ' done' : ''}${isDragging ? ' dragging-subtask' : ''}${editing ? ' editing' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="sortable"
      aria-label={`Drag to reorder ${plain || 'checklist item'}`}
    >
      <span className="list-drag-handle subtask-drag-handle" aria-hidden>
        <IconGripVertical {...ICON} aria-hidden />
      </span>
      <Checkbox
        size="xs"
        checked={s.done}
        disabled={busy}
        data-no-dnd
        aria-label={
          s.done
            ? `Mark “${plain || 'item'}” incomplete`
            : `Mark “${plain || 'item'}” complete`
        }
        onChange={() => onToggle(s.id, !s.done)}
      />
      <div className="subtask-body">
        {editing ? (
          <div
            ref={editorRef}
            className="subtask-editor"
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={taskCopy.checklistEdit}
            title={taskCopy.checklistFormatHint}
            suppressContentEditableWarning
            data-no-dnd
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                document.execCommand('insertLineBreak')
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                skipBlurCommit.current = true
                setEditingId(null)
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
              } else if (key === '.' || (e.shiftKey && key === 'l')) {
                e.preventDefault()
                runFormat('larger')
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="subtask-title"
            onClick={() => setEditingId(s.id)}
          >
            <span
              className="subtask-title-html"
              dangerouslySetInnerHTML={{ __html: subtaskDisplayHtml(s.title) }}
            />
          </button>
        )}
      </div>
      {showTimers && onToggleTimer ? (
        <TimeControl
          compact
          running={Boolean(running)}
          hours={hours ?? 0}
          busy={busy}
          onToggleTimer={() =>
            onToggleTimer(s.id, running ? 'stop' : 'start')
          }
        />
      ) : null}
      <ActionIcon
        color="red"
        variant="subtle"
        size="sm"
        data-no-dnd
        aria-label={`Delete “${plain || 'checklist item'}”`}
        onClick={() => onDelete(s.id)}
      >
        <IconX {...ICON} />
      </ActionIcon>
    </li>
  )
}
