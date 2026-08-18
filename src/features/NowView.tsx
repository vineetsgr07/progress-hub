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
import { IconGripVertical, IconPin } from '@tabler/icons-react'
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
import { EMPTY_NOW_PROGRESS, nowProgressFromLists } from './now-progress'
import { NowItemCheck } from './NowItemCheck'
import { NowPulse } from './NowPulse'
import { ReminderList } from './ReminderList'
import { ReminderWhen } from './ReminderWhen'
import { reminderWhenSavedLabel } from './reminder-when'
import { overlayNowItems } from './task-merge'
import { TimeControl } from './TimeControl'
import { subtaskDisplayHtml, subtaskPlainText } from './subtask-html'

const ICON = { size: 14, stroke: 1.5 } as const

let nowPageCache: { date: string; page: NowPage } | null = null

function rememberNowPage(next: NowPage) {
  nowPageCache = { date: next.date, page: next }
}

function emptyNowPage(date: string, reminders: Reminder[] = []): NowPage {
  return {
    date,
    items: [],
    reminders,
    habits: [],
    progress: nowProgressFromLists({
      checklistCompleted: 0,
      checklistTotal: 0,
      habits: [],
      remindersDue: reminders.filter((r) => r.dueDate === date),
      overdueOpen: 0,
    }),
  }
}

function withNowProgress(
  prev: NowPage,
  patch: Partial<Pick<NowPage, 'items' | 'reminders' | 'habits'>> & {
    checklistCompleted?: number
    checklistTotal?: number
    overdueOpen?: number
  },
): NowPage {
  const reminders = patch.reminders ?? prev.reminders
  const habits = patch.habits ?? prev.habits
  const next: NowPage = {
    ...prev,
    items: patch.items ?? prev.items,
    reminders,
    habits,
    progress: nowProgressFromLists({
      checklistCompleted:
        patch.checklistCompleted ?? prev.progress.checklist.completed,
      checklistTotal: patch.checklistTotal ?? prev.progress.checklist.total,
      habits,
      remindersDue: reminders.filter((r) => r.dueDate === prev.date),
      overdueOpen: patch.overdueOpen ?? prev.progress.overdueOpen,
    }),
  }
  rememberNowPage(next)
  return next
}

type Props = {
  date: string
  tick: number
  busy?: boolean
  tasks: Task[]
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
  onDateChange?: (date: string) => void
  onOpenReminders?: () => void
}

export function NowView({
  date,
  tick,
  busy,
  tasks,
  onOpenTask,
  onEnsureTask,
  onToggleItem,
  onTogglePin,
  onToggleTimer,
  onError,
  onToast,
  onDateChange,
  onOpenReminders,
}: Props) {
  const [page, setPage] = useState<NowPage | null>(() =>
    nowPageCache?.date === date ? nowPageCache.page : null,
  )
  const [loading, setLoading] = useState(
    !(nowPageCache?.date === date && nowPageCache.page),
  )
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftDate, setDraftDate] = useState(date)
  const [draftTime, setDraftTime] = useState<string | null>(null)
  const [showDoneHabits, setShowDoneHabits] = useState(false)
  const [showDoneReminders, setShowDoneReminders] = useState(false)
  const requestId = useRef(0)

  async function load() {
    const id = ++requestId.current
    setError(null)
    const soft = nowPageCache?.date === date && nowPageCache.page != null
    if (!soft) setLoading(true)
    try {
      const next = await api.getNow(date)
      if (id !== requestId.current) return
      rememberNowPage(next)
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
    setShowDoneReminders(false)
    setDraftDate(date)
    if (nowPageCache?.date === date && nowPageCache.page) {
      setPage(nowPageCache.page)
    } else {
      setPage(null)
    }
    void load()
  }, [date])

  async function addReminder() {
    const title = draft.trim()
    if (!title || busy) return
    try {
      const created = await api.createReminder({
        title,
        dueDate: draftDate,
        dueTime: draftTime,
      })
      setDraft('')
      setDraftTime(null)
      setDraftDate(date)
      setPage((prev) =>
        prev
          ? withNowProgress(prev, {
              reminders: [...prev.reminders, created],
            })
          : emptyNowPage(date, [created]),
      )
      if (created.dueDate !== date) {
        setPage((prev) =>
          prev
            ? withNowProgress(prev, {
                reminders: prev.reminders.filter((r) => r.id !== created.id),
              })
            : prev,
        )
        onToast?.(nowCopy.savedFor(reminderWhenSavedLabel(created.dueDate)))
      }
    } catch {
      onError?.(nowCopy.reminderFailed)
    }
  }

  const items = overlayNowItems(page?.items ?? [], tasks)
  const reminders = (page?.reminders ?? []).filter((r) => r.dueDate === date)
  const habits = page?.habits ?? []
  const progress = page?.progress ?? EMPTY_NOW_PROGRESS
  const openHabits = habits.filter((h) => !h.completed)
  const doneHabits = habits.filter((h) => h.completed)
  const visibleHabits = showDoneHabits
    ? [...openHabits, ...doneHabits]
    : openHabits
  const openReminders = reminders.filter((r) => !r.done)
  const doneReminders = reminders.filter((r) => r.done)
  const visibleReminders = showDoneReminders
    ? [...openReminders, ...doneReminders]
    : openReminders

  function liveHours(item: PinnedChecklistItem) {
    const base = item.hours ?? 0
    if (!item.timerStartedAt || item.timerSubtaskId !== item.id) return base
    const started = new Date(item.timerStartedAt).getTime()
    if (!Number.isFinite(started)) return base
    void tick
    return base + (Date.now() - started) / 3_600_000
  }

  return (
    <div className="now-layout">
    <div className="now-main">
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
          <NowHabitList
            habits={habits}
            visibleHabits={visibleHabits}
            doneHabits={doneHabits}
            showDoneHabits={showDoneHabits}
            busy={busy}
            date={date}
            onError={onError}
            setPage={setPage}
          />
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
        {visibleReminders.length > 0 ? (
          <ReminderList
            reminders={visibleReminders}
            viewDate={date}
            busy={busy}
            onError={onError}
            onToast={onToast}
            persistIds={(visible) => {
              const persist = showDoneReminders
                ? visible
                : [...visible, ...doneReminders]
              return persist.map((r) => r.id)
            }}
            onRemindersChange={(nextVisible) => {
              setPage((prev) => {
                if (!prev) return prev
                const persist = showDoneReminders
                  ? nextVisible
                  : [...nextVisible, ...doneReminders]
                return withNowProgress(prev, { reminders: persist })
              })
            }}
            onMovedOffDate={(moved) => {
              setPage((prev) =>
                prev
                  ? withNowProgress(prev, {
                      reminders: prev.reminders.filter((r) => r.id !== moved.id),
                      overdueOpen:
                        moved.dueDate < date
                          ? prev.progress.overdueOpen + 1
                          : prev.progress.overdueOpen,
                    })
                  : prev,
              )
              onToast?.(nowCopy.savedFor(reminderWhenSavedLabel(moved.dueDate)))
            }}
          />
        ) : null}
        {doneReminders.length > 0 ? (
          <button
            type="button"
            className="checklist-done-toggle"
            aria-expanded={showDoneReminders}
            aria-label={
              showDoneReminders
                ? nowCopy.hideDoneRemindersAria
                : nowCopy.showAllRemindersAria
            }
            onClick={() => setShowDoneReminders((v) => !v)}
          >
            {showDoneReminders
              ? nowCopy.hideDone
              : nowCopy.showAll(doneReminders.length)}
          </button>
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
          <ReminderWhen
            dueDate={draftDate}
            dueTime={draftTime}
            disabled={busy}
            onChange={(next) => {
              setDraftDate(next.dueDate)
              setDraftTime(next.dueTime)
            }}
          />
          <Button
            variant="default"
            size="xs"
            disabled={busy || !draft.trim()}
            aria-label={nowCopy.addReminder}
            onClick={() => void addReminder()}
          >
            {nowCopy.addReminderShort}
          </Button>
        </div>
      </section>
    </div>
    </div>
    <div className="now-side today-side">
      <NowPulse
        date={date}
        progress={progress}
        onDateChange={onDateChange}
        onOpenReminders={onOpenReminders}
      />
    </div>
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
      <NowItemCheck>
        <Checkbox
          size="xs"
          checked={item.done}
          disabled={busy}
          aria-label={
            item.done
              ? `${nowCopy.markNotDone}: ${plain}`
              : `${nowCopy.markDone}: ${plain}`
          }
          onChange={() => {
            onToggleItem(item.taskId, item.id, !item.done)
            setPage((prev) =>
              prev
                ? withNowProgress(prev, {
                    items: prev.items.filter((row) => row.id !== item.id),
                    checklistCompleted: prev.progress.checklist.completed + 1,
                  })
                : prev,
            )
          }}
        />
      </NowItemCheck>
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
                ? withNowProgress(prev, {
                    items: prev.items.filter((row) => row.id !== item.id),
                    checklistTotal: Math.max(0, prev.progress.checklist.total - 1),
                  })
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

function useNowSensors() {
  return useSensors(
    useSensor(TaskMouseSensor, TASK_MOUSE_SENSOR_OPTIONS),
    useSensor(TaskTouchSensor, TASK_TOUCH_SENSOR_OPTIONS),
  )
}

function NowHabitList({
  habits,
  visibleHabits,
  doneHabits,
  showDoneHabits,
  busy,
  date,
  onError,
  setPage,
}: {
  habits: Habit[]
  visibleHabits: Habit[]
  doneHabits: Habit[]
  showDoneHabits: boolean
  busy?: boolean
  date: string
  onError?: (message: string) => void
  setPage: Dispatch<SetStateAction<NowPage | null>>
}) {
  const sensors = useNowSensors()

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = visibleHabits.findIndex((h) => h.id === active.id)
    const newIndex = visibleHabits.findIndex((h) => h.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reorderedVisible = arrayMove(visibleHabits, oldIndex, newIndex)
    const persist = showDoneHabits
      ? reorderedVisible
      : [...reorderedVisible, ...doneHabits]
    const next = persist.map((h, index) => ({ ...h, sortOrder: index }))
    setPage((prev) => (prev ? { ...prev, habits: next } : prev))
    try {
      await api.reorderHabits(next.map((h) => h.id))
    } catch {
      setPage((prev) => (prev ? { ...prev, habits } : prev))
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
        items={visibleHabits.map((h) => h.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="now-list">
          {visibleHabits.map((habit) => (
            <SortableHabitRow
              key={habit.id}
              habit={habit}
              busy={busy}
              onToggle={async () => {
                const next = !habit.completed
                setPage((prev) =>
                  prev
                    ? withNowProgress(prev, {
                        habits: prev.habits.map((h) =>
                          h.id === habit.id ? { ...h, completed: next } : h,
                        ),
                      })
                    : prev,
                )
                try {
                  const updated = await api.setHabitEntry(habit.id, date, next)
                  setPage((prev) =>
                    prev
                      ? withNowProgress(prev, {
                          habits: prev.habits.map((h) =>
                            h.id === habit.id ? updated : h,
                          ),
                        })
                      : prev,
                  )
                } catch {
                  setPage((prev) =>
                    prev
                      ? withNowProgress(prev, {
                          habits: prev.habits.map((h) =>
                            h.id === habit.id ? habit : h,
                          ),
                        })
                      : prev,
                  )
                  onError?.(habitsCopy.error)
                }
              }}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableHabitRow({
  habit,
  busy,
  onToggle,
}: {
  habit: Habit
  busy?: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: habit.id })
  return (
    <li
      ref={setNodeRef}
      className={`now-item is-sortable${habit.completed ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="sortable"
      aria-label={habitsCopy.dragAria(habit.title)}
    >
      <span className="list-drag-handle subtask-drag-handle" aria-hidden>
        <IconGripVertical {...ICON} aria-hidden />
      </span>
      <NowItemCheck>
        <Checkbox
          size="xs"
          checked={habit.completed}
          disabled={busy}
          aria-label={habitsCopy.toggleAria(habit.title, habit.completed)}
          onChange={onToggle}
        />
      </NowItemCheck>
      <div className="now-item-body">
        <span className="now-item-title">{habit.title}</span>
      </div>
    </li>
  )
}
