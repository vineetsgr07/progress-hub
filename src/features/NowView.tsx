import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
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
import { ActionIcon, Button, Checkbox, TextInput } from '@mantine/core'
import { IconGripVertical, IconPin, IconX } from '@tabler/icons-react'
import { api } from '../api'
import type { Habit, NowPage, PinnedChecklistItem, Reminder, Task } from '../types'
import {
  TASK_MOUSE_SENSOR_OPTIONS,
  TASK_TOUCH_SENSOR_OPTIONS,
  TaskMouseSensor,
  TaskTouchSensor,
} from './drag-sensors'
import { habitsCopy } from './habits-copy'
import { nowCopy } from './now-copy'
import { TimeControl } from './TimeControl'
import { subtaskDisplayHtml, subtaskPlainText } from './subtask-html'

const ICON = { size: 14, stroke: 1.5 } as const

type Props = {
  date: string
  tick: number
  busy?: boolean
  onOpenTask: (task: Task) => void
  onEnsureTask: (task: Task) => void
  onToggleItem: (taskId: string, id: string, done: boolean) => void
  onTogglePin: (taskId: string, id: string, pinned: boolean) => void
  onToggleTimer: (
    taskId: string,
    subtaskId: string,
    action: 'start' | 'stop',
  ) => void | Promise<void>
  onError?: (message: string) => void
  onToast?: (message: string) => void
}

export function NowView({
  date,
  tick,
  busy,
  onOpenTask,
  onEnsureTask,
  onToggleItem,
  onTogglePin,
  onToggleTimer,
  onError,
  onToast,
}: Props) {
  const [page, setPage] = useState<NowPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftTime, setDraftTime] = useState('')
  const [showDoneHabits, setShowDoneHabits] = useState(false)
  const requestId = useRef(0)

  async function load() {
    const id = ++requestId.current
    setError(null)
    setLoading(true)
    try {
      const next = await api.getNow(date)
      if (id !== requestId.current) return
      setPage(next)
    } catch {
      if (id !== requestId.current) return
      const message =
        typeof navigator !== 'undefined' && navigator.onLine === false
          ? nowCopy.loadError
          : nowCopy.loadError
      setError(message)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    setShowDoneHabits(false)
    void load()
  }, [date])

  async function addReminder() {
    const title = draft.trim()
    if (!title || busy) return
    try {
      const created = await api.createReminder({
        title,
        dueDate: date,
        dueTime: draftTime || null,
      })
      setDraft('')
      setDraftTime('')
      setPage((prev) =>
        prev
          ? { ...prev, reminders: [...prev.reminders, created] }
          : { date, items: [], reminders: [created], habits: [] },
      )
    } catch {
      onError?.(nowCopy.reminderFailed)
    }
  }

  const items = page?.items ?? []
  const reminders = page?.reminders ?? []
  const habits = page?.habits ?? []
  const openHabits = habits.filter((h) => !h.completed)
  const doneHabits = habits.filter((h) => h.completed)
  const visibleHabits = showDoneHabits
    ? [...openHabits, ...doneHabits]
    : openHabits

  function liveHours(item: PinnedChecklistItem) {
    const base = item.hours ?? 0
    if (!item.timerStartedAt || item.timerSubtaskId !== item.id) return base
    const started = new Date(item.timerStartedAt).getTime()
    if (!Number.isFinite(started)) return base
    void tick
    return base + (Date.now() - started) / 3_600_000
  }

  return (
    <div className="now-view">
      {loading && !page ? (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      ) : null}

      {error ? (
        <div className="now-error">
          <p>{error}</p>
          <Button variant="default" size="xs" onClick={() => void load()}>
            {nowCopy.retry}
          </Button>
        </div>
      ) : null}

      <section className="now-section" aria-labelledby="now-tasks-title">
        <h2 id="now-tasks-title" className="now-section-title">
          {nowCopy.tasks}
        </h2>
        {!loading && items.length === 0 ? (
          <p className="now-empty">{nowCopy.emptyTasks}</p>
        ) : null}
        {items.length > 0 ? (
          <NowTaskList
            items={items}
            busy={busy}
            liveHours={liveHours}
            onOpenTask={onOpenTask}
            onEnsureTask={onEnsureTask}
            onToggleItem={onToggleItem}
            onTogglePin={onTogglePin}
            onToggleTimer={onToggleTimer}
            onError={onError}
            onToast={onToast}
            setPage={setPage}
            load={load}
          />
        ) : null}
      </section>

      <section className="now-section" aria-labelledby="now-habits-title">
        <h2 id="now-habits-title" className="now-section-title">
          {nowCopy.habits}
        </h2>
        {!loading && habits.length === 0 ? (
          <p className="now-empty">{nowCopy.emptyHabits}</p>
        ) : null}
        {visibleHabits.length > 0 ? (
          <ul className="now-list">
            {visibleHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                busy={busy}
                onToggle={async () => {
                  const next = !habit.completed
                  setPage((prev) =>
                    prev
                      ? {
                          ...prev,
                          habits: prev.habits.map((h) =>
                            h.id === habit.id ? { ...h, completed: next } : h,
                          ),
                        }
                      : prev,
                  )
                  try {
                    const updated = await api.setHabitEntry(
                      habit.id,
                      date,
                      next,
                    )
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            habits: prev.habits.map((h) =>
                              h.id === habit.id ? updated : h,
                            ),
                          }
                        : prev,
                    )
                  } catch {
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            habits: prev.habits.map((h) =>
                              h.id === habit.id ? habit : h,
                            ),
                          }
                        : prev,
                    )
                    onError?.(habitsCopy.error)
                  }
                }}
              />
            ))}
          </ul>
        ) : null}
        {doneHabits.length > 0 ? (
          <button
            type="button"
            className="checklist-done-toggle"
            aria-expanded={showDoneHabits}
            aria-label={
              showDoneHabits ? nowCopy.hideDoneAria : nowCopy.showAllAria
            }
            onClick={() => setShowDoneHabits((v) => !v)}
          >
            {showDoneHabits
              ? nowCopy.hideDone
              : nowCopy.showAll(doneHabits.length)}
          </button>
        ) : null}
      </section>

      <section className="now-section" aria-labelledby="now-reminders-title">
        <h2 id="now-reminders-title" className="now-section-title">
          {nowCopy.reminders}
        </h2>
        {!loading && reminders.length === 0 ? (
          <p className="now-empty">{nowCopy.emptyReminders}</p>
        ) : null}
        {reminders.length > 0 ? (
          <ul className="now-list">
            {reminders.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                viewDate={date}
                busy={busy}
                onToggle={async (done) => {
                  try {
                    const updated = await api.updateReminder(reminder.id, { done })
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            reminders: done
                              ? prev.reminders.filter((r) => r.id !== reminder.id)
                              : prev.reminders.map((r) =>
                                  r.id === reminder.id ? updated : r,
                                ),
                          }
                        : prev,
                    )
                  } catch {
                    onError?.(nowCopy.reminderFailed)
                  }
                }}
                onDelete={async () => {
                  try {
                    await api.deleteReminder(reminder.id)
                    setPage((prev) =>
                      prev
                        ? {
                            ...prev,
                            reminders: prev.reminders.filter(
                              (r) => r.id !== reminder.id,
                            ),
                          }
                        : prev,
                    )
                    onToast?.(nowCopy.reminderDeleted)
                  } catch {
                    onError?.(nowCopy.reminderFailed)
                  }
                }}
              />
            ))}
          </ul>
        ) : null}
        <div className="now-reminder-add">
          <TextInput
            placeholder={nowCopy.addPlaceholder}
            size="xs"
            value={draft}
            disabled={busy}
            aria-label={nowCopy.addReminder}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addReminder()
              }
            }}
          />
          <input
            type="time"
            className="now-reminder-time"
            value={draftTime}
            aria-label={nowCopy.timeAria}
            disabled={busy}
            onChange={(e) => setDraftTime(e.currentTarget.value)}
          />
          <Button
            variant="default"
            size="xs"
            disabled={busy || !draft.trim()}
            onClick={() => void addReminder()}
          >
            {nowCopy.addReminder}
          </Button>
        </div>
      </section>
    </div>
  )
}

function NowTaskList({
  items,
  busy,
  liveHours,
  onOpenTask,
  onEnsureTask,
  onToggleItem,
  onTogglePin,
  onToggleTimer,
  onError,
  onToast,
  setPage,
  load,
}: {
  items: PinnedChecklistItem[]
  busy?: boolean
  liveHours: (item: PinnedChecklistItem) => number
  onOpenTask: (task: Task) => void
  onEnsureTask: (task: Task) => void
  onToggleItem: (taskId: string, id: string, done: boolean) => void
  onTogglePin: (taskId: string, id: string, pinned: boolean) => void
  onToggleTimer: (
    taskId: string,
    subtaskId: string,
    action: 'start' | 'stop',
  ) => void | Promise<void>
  onError?: (message: string) => void
  onToast?: (message: string) => void
  setPage: Dispatch<SetStateAction<NowPage | null>>
  load: () => Promise<void>
}) {
  const sensors = useSensors(
    useSensor(TaskMouseSensor, TASK_MOUSE_SENSOR_OPTIONS),
    useSensor(TaskTouchSensor, TASK_TOUCH_SENSOR_OPTIONS),
  )

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(items, oldIndex, newIndex)
    setPage((prev) => (prev ? { ...prev, items: next } : prev))
    try {
      await api.reorderNowItems(next.map((item) => item.id))
    } catch {
      setPage((prev) => (prev ? { ...prev, items } : prev))
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
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="now-list">
          {items.map((item) => (
            <SortableNowItem
              key={item.id}
              item={item}
              busy={busy}
              hours={liveHours(item)}
              onOpenTask={onOpenTask}
              onEnsureTask={onEnsureTask}
              onToggleItem={onToggleItem}
              onTogglePin={onTogglePin}
              onToggleTimer={onToggleTimer}
              onToast={onToast}
              setPage={setPage}
              load={load}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableNowItem({
  item,
  busy,
  hours,
  onOpenTask,
  onEnsureTask,
  onToggleItem,
  onTogglePin,
  onToggleTimer,
  onToast,
  setPage,
  load,
}: {
  item: PinnedChecklistItem
  busy?: boolean
  hours: number
  onOpenTask: (task: Task) => void
  onEnsureTask: (task: Task) => void
  onToggleItem: (taskId: string, id: string, done: boolean) => void
  onTogglePin: (taskId: string, id: string, pinned: boolean) => void
  onToggleTimer: (
    taskId: string,
    subtaskId: string,
    action: 'start' | 'stop',
  ) => void | Promise<void>
  onToast?: (message: string) => void
  setPage: Dispatch<SetStateAction<NowPage | null>>
  load: () => Promise<void>
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })
  const plain = subtaskPlainText(item.title)
  const running = Boolean(item.timerStartedAt) && item.timerSubtaskId === item.id

  return (
    <li
      ref={setNodeRef}
      className={`now-item is-sortable${item.done ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="sortable"
      aria-label={nowCopy.dragAria(plain)}
    >
      <span className="list-drag-handle subtask-drag-handle" aria-hidden>
        <IconGripVertical {...ICON} aria-hidden />
      </span>
      <Checkbox
        size="xs"
        checked={item.done}
        disabled={busy}
        data-no-dnd
        aria-label={
          item.done
            ? `${nowCopy.markNotDone}: ${plain}`
            : `${nowCopy.markDone}: ${plain}`
        }
        onChange={() => {
          onToggleItem(item.taskId, item.id, !item.done)
          setPage((prev) =>
            prev
              ? {
                  ...prev,
                  items: prev.items.filter((row) => row.id !== item.id),
                }
              : prev,
          )
        }}
      />
      <div className="now-item-body">
        <button
          type="button"
          className="now-item-title"
          aria-label={nowCopy.openTask(item.taskTitle)}
          onClick={() => {
            onEnsureTask(item.task)
            onOpenTask(item.task)
          }}
        >
          <span
            className="now-item-title-html"
            dangerouslySetInnerHTML={{
              __html: subtaskDisplayHtml(item.title),
            }}
          />
        </button>
        <span className="now-item-parent">{item.taskTitle}</span>
      </div>
      <div className="now-item-actions" data-no-dnd>
        <ActionIcon
          variant="subtle"
          size="sm"
          className="subtask-pin is-pinned"
          aria-label={nowCopy.unpin}
          title={nowCopy.unpin}
          disabled={busy}
          onClick={() => {
            onTogglePin(item.taskId, item.id, false)
            setPage((prev) =>
              prev
                ? {
                    ...prev,
                    items: prev.items.filter((row) => row.id !== item.id),
                  }
                : prev,
            )
            onToast?.(nowCopy.unpinnedToast)
          }}
        >
          <IconPin {...ICON} />
        </ActionIcon>
        <TimeControl
          compact
          idleIconOnly
          running={running}
          hours={hours}
          busy={busy}
          onToggleTimer={() => {
            void (async () => {
              onEnsureTask(item.task)
              await onToggleTimer(
                item.taskId,
                item.id,
                running ? 'stop' : 'start',
              )
              await load()
            })()
          }}
        />
      </div>
    </li>
  )
}

function HabitRow({
  habit,
  busy,
  onToggle,
}: {
  habit: Habit
  busy?: boolean
  onToggle: () => void
}) {
  return (
    <li className={`now-item${habit.completed ? ' is-done' : ''}`}>
      <Checkbox
        size="xs"
        checked={habit.completed}
        disabled={busy}
        aria-label={habitsCopy.toggleAria(habit.title, habit.completed)}
        onChange={onToggle}
      />
      <div className="now-item-body">
        <span className="now-item-title">{habit.title}</span>
      </div>
    </li>
  )
}

function reminderMeta(reminder: Reminder, viewDate: string) {
  if (reminder.dueDate < viewDate) {
    return reminder.dueTime
      ? nowCopy.stillOpenTimed(reminder.dueDate, reminder.dueTime)
      : nowCopy.stillOpen(reminder.dueDate)
  }
  return reminder.dueTime
}

function ReminderRow({
  reminder,
  viewDate,
  busy,
  onToggle,
  onDelete,
}: {
  reminder: Reminder
  viewDate: string
  busy?: boolean
  onToggle: (done: boolean) => void
  onDelete: () => void
}) {
  const meta = reminderMeta(reminder, viewDate)
  return (
    <li className={`now-item now-reminder${reminder.done ? ' is-done' : ''}`}>
      <Checkbox
        size="xs"
        checked={reminder.done}
        disabled={busy}
        aria-label={
          reminder.done
            ? `${nowCopy.markNotDone}: ${reminder.title}`
            : `${nowCopy.markDone}: ${reminder.title}`
        }
        onChange={() => onToggle(!reminder.done)}
      />
      <div className="now-item-body">
        <span className="now-item-title">{reminder.title}</span>
        {meta ? <span className="now-item-parent">{meta}</span> : null}
      </div>
      <div className="now-item-actions">
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
