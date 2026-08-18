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
import { ActionIcon, Checkbox, Textarea } from '@mantine/core'
import { IconGripVertical, IconX } from '@tabler/icons-react'
import { api } from '../api'
import type { Reminder } from '../types'
import {
  TASK_MOUSE_SENSOR_OPTIONS,
  TASK_TOUCH_SENSOR_OPTIONS,
  TaskMouseSensor,
  TaskTouchSensor,
} from './drag-sensors'
import { nowCopy } from './now-copy'
import { ReminderWhen } from './ReminderWhen'

const ICON = { size: 14, stroke: 1.5 } as const

type Props = {
  reminders: Reminder[]
  viewDate: string
  busy?: boolean
  onError?: (message: string) => void
  onToast?: (message: string) => void
  onRemindersChange: (next: Reminder[]) => void
  onMovedOffDate?: (reminder: Reminder) => void
  persistIds?: (visible: Reminder[]) => string[]
}

export function ReminderList({
  reminders,
  viewDate,
  busy,
  onError,
  onToast,
  onRemindersChange,
  onMovedOffDate,
  persistIds,
}: Props) {
  const sensors = useSensors(
    useSensor(TaskMouseSensor, TASK_MOUSE_SENSOR_OPTIONS),
    useSensor(TaskTouchSensor, TASK_TOUCH_SENSOR_OPTIONS),
  )

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = reminders.findIndex((r) => r.id === active.id)
    const newIndex = reminders.findIndex((r) => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(reminders, oldIndex, newIndex).map((r, index) => ({
      ...r,
      position: index,
    }))
    onRemindersChange(next)
    try {
      await api.reorderReminders(persistIds ? persistIds(next) : next.map((r) => r.id))
    } catch {
      onRemindersChange(reminders)
      onError?.(nowCopy.reorderFailed)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => void onDragEnd(e)}
    >
      <SortableContext
        items={reminders.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="now-list">
          {reminders.map((reminder) => (
            <SortableReminderRow
              key={reminder.id}
              reminder={reminder}
              viewDate={viewDate}
              busy={busy}
              onToggle={async (done) => {
                try {
                  const updated = await api.updateReminder(reminder.id, { done })
                  onRemindersChange(
                    reminders.map((r) => (r.id === reminder.id ? updated : r)),
                  )
                } catch {
                  onError?.(nowCopy.reminderFailed)
                }
              }}
              onSave={async (patch) => {
                const previous = reminder
                onRemindersChange(
                  reminders.map((r) =>
                    r.id === reminder.id ? { ...r, ...patch } : r,
                  ),
                )
                try {
                  const updated = await api.updateReminder(reminder.id, patch)
                  onRemindersChange(
                    reminders.map((r) => (r.id === reminder.id ? updated : r)),
                  )
                  if (updated.dueDate !== viewDate) onMovedOffDate?.(updated)
                } catch {
                  onRemindersChange(
                    reminders.map((r) =>
                      r.id === reminder.id ? previous : r,
                    ),
                  )
                  onError?.(nowCopy.reminderFailed)
                }
              }}
              onDelete={async () => {
                try {
                  await api.deleteReminder(reminder.id)
                  onRemindersChange(
                    reminders.filter((r) => r.id !== reminder.id),
                  )
                  onToast?.(nowCopy.reminderDeleted)
                } catch {
                  onError?.(nowCopy.reminderFailed)
                }
              }}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function reminderMeta(reminder: Reminder, viewDate: string) {
  if (reminder.dueDate < viewDate) {
    return reminder.dueTime
      ? nowCopy.stillOpenTimed(reminder.dueDate, reminder.dueTime)
      : nowCopy.stillOpen(reminder.dueDate)
  }
  if (reminder.dueDate > viewDate) {
    return reminder.dueTime
      ? `${reminder.dueDate} · ${reminder.dueTime}`
      : reminder.dueDate
  }
  return reminder.dueTime
}

function SortableReminderRow({
  reminder,
  viewDate,
  busy,
  onToggle,
  onSave,
  onDelete,
}: {
  reminder: Reminder
  viewDate: string
  busy?: boolean
  onToggle: (done: boolean) => void
  onSave: (patch: {
    title: string
    dueDate: string
    dueTime: string | null
  }) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: reminder.id })
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(reminder.title)
  const skipBlur = useRef(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const meta = reminderMeta(reminder, viewDate)

  function clearBlurTimer() {
    if (blurTimer.current == null) return
    clearTimeout(blurTimer.current)
    blurTimer.current = null
  }

  useEffect(() => () => clearBlurTimer(), [])

  function beginEdit() {
    setTitleDraft(reminder.title)
    setEditing(true)
  }

  function saveTitle() {
    clearBlurTimer()
    const title = titleDraft.trim()
    setEditing(false)
    if (!title) return
    if (title === reminder.title) return
    onSave({
      title,
      dueDate: reminder.dueDate,
      dueTime: reminder.dueTime,
    })
  }

  function onEditorBlur(e: { relatedTarget: EventTarget | null }) {
    if (skipBlur.current) {
      skipBlur.current = false
      return
    }
    const next = e.relatedTarget as HTMLElement | null
    if (next?.closest('.now-reminder')) return
    clearBlurTimer()
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null
      if (skipBlur.current) {
        skipBlur.current = false
        return
      }
      const active = document.activeElement as HTMLElement | null
      if (active?.closest('.now-reminder')) return
      saveTitle()
    }, 0)
  }

  return (
    <li
      ref={setNodeRef}
      className={`now-item now-reminder is-sortable${reminder.done ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}${editing ? ' is-editing' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="sortable"
      aria-label={nowCopy.dragReminder(reminder.title)}
    >
      <span className="list-drag-handle subtask-drag-handle" aria-hidden>
        <IconGripVertical {...ICON} aria-hidden />
      </span>
      <Checkbox
        size="xs"
        checked={reminder.done}
        disabled={busy}
        data-no-dnd
        aria-label={
          reminder.done
            ? `${nowCopy.markNotDone}: ${reminder.title}`
            : `${nowCopy.markDone}: ${reminder.title}`
        }
        onChange={() => onToggle(!reminder.done)}
      />
      <div className="now-item-body">
        {editing ? (
          <div className="now-reminder-editor-row">
            <Textarea
              className="now-reminder-editor"
              autosize
              minRows={1}
              size="xs"
              value={titleDraft}
              disabled={busy}
              data-no-dnd
              autoFocus
              aria-label={nowCopy.editReminder}
              onChange={(e) => setTitleDraft(e.currentTarget.value)}
              onBlur={onEditorBlur}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  skipBlur.current = true
                  clearBlurTimer()
                  setEditing(false)
                  return
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  skipBlur.current = true
                  saveTitle()
                }
              }}
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              className="now-item-title"
              data-no-dnd
              aria-label={`${nowCopy.editReminder}: ${reminder.title}`}
              onClick={beginEdit}
            >
              {reminder.title}
            </button>
            {meta ? <span className="now-item-parent">{meta}</span> : null}
          </>
        )}
      </div>
      <div className="now-item-actions" data-no-dnd>
        <ReminderWhen
          dueDate={reminder.dueDate}
          dueTime={reminder.dueTime}
          disabled={busy}
          onChange={(next) => {
            if (
              next.dueDate === reminder.dueDate &&
              next.dueTime === reminder.dueTime
            ) {
              return
            }
            onSave({ title: reminder.title, ...next })
          }}
        />
        <ActionIcon
          color="red"
          variant="subtle"
          size="sm"
          aria-label={`${nowCopy.deleteReminder}: ${reminder.title}`}
          disabled={busy}
          onClick={onDelete}
        >
          <IconX {...ICON} />
        </ActionIcon>
      </div>
    </li>
  )
}
