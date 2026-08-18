import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
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
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Menu, TextInput } from '@mantine/core'
import {
  IconChevronDown,
  IconChevronRight,
  IconDotsVertical,
  IconGripVertical,
} from '@tabler/icons-react'
import { api } from '../api'
import type { Habit } from '../types'
import { habitsCopy } from './habits-copy'
import {
  habitDaySummary,
  habitSummaryLabel,
  readHabitsCollapsed,
  writeHabitsCollapsed,
} from './habits-summary'

type Props = {
  date: string
  habits: Habit[] | null
  onHabitsChange: Dispatch<SetStateAction<Habit[] | null>>
  busy?: boolean
  onError?: (message: string) => void
  onOpenHistory?: () => void
}

export function HabitsPanel({
  date,
  habits,
  onHabitsChange,
  busy,
  onError,
  onOpenHistory,
}: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [collapsed, setCollapsed] = useState(() => readHabitsCollapsed())
  const requestId = useRef(0)
  const habitsRef = useRef<Habit[] | null>(habits)
  /** Menu close restores focus and can blur a brand-new rename field. */
  const ignoreRenameBlur = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    habitsRef.current = habits
  }, [habits])

  const setHabits = onHabitsChange
  const loading = habits == null && !error

  useEffect(() => {
    if (!renamingId) return
    const t = window.setTimeout(() => {
      ignoreRenameBlur.current = false
    }, 50)
    return () => window.clearTimeout(t)
  }, [renamingId])

  async function retry() {
    const id = ++requestId.current
    const soft = habitsRef.current != null
    if (soft) setRefreshing(true)
    setError(null)
    try {
      const res = await api.getHabits(date)
      if (requestId.current !== id) return
      setHabits(res.habits)
      setError(null)
    } catch {
      if (requestId.current !== id) return
      if (!habitsRef.current) setHabits(null)
      setError(habitsCopy.error)
    } finally {
      if (requestId.current !== id) return
      setRefreshing(false)
    }
  }

  async function addHabit() {
    const title = draft.trim()
    if (!title || busy) return
    setDraft('')
    try {
      const created = await api.createHabit(title)
      setHabits((prev) => [...(prev ?? []), { ...created, completed: false }])
      if (collapsed) setCollapsedState(false)
    } catch {
      onError?.(habitsCopy.error)
      setDraft(title)
    }
  }

  function setCollapsedState(next: boolean) {
    setCollapsed(next)
    writeHabitsCollapsed(next)
  }

  function beginRename(habit: Habit) {
    ignoreRenameBlur.current = true
    setRenameDraft(habit.title)
    setRenamingId(habit.id)
  }

  async function toggle(habit: Habit) {
    if (busy || !habits || renamingId === habit.id) return
    const next = !habit.completed
    setHabits((prev) =>
      (prev ?? []).map((h) =>
        h.id === habit.id ? { ...h, completed: next } : h,
      ),
    )
    try {
      await api.setHabitEntry(habit.id, date, next)
    } catch {
      setHabits((prev) =>
        (prev ?? []).map((h) =>
          h.id === habit.id ? { ...h, completed: habit.completed } : h,
        ),
      )
      onError?.(habitsCopy.error)
    }
  }

  async function archive(habit: Habit) {
    try {
      await api.updateHabit(habit.id, { archived: true })
      setHabits((prev) => (prev ?? []).filter((h) => h.id !== habit.id))
      if (renamingId === habit.id) setRenamingId(null)
    } catch {
      onError?.(habitsCopy.error)
    }
  }

  async function commitRename(habit: Habit) {
    if (ignoreRenameBlur.current) return
    const title = renameDraft.trim()
    setRenamingId(null)
    if (!title || title === habit.title) return
    setHabits((prev) =>
      (prev ?? []).map((h) => (h.id === habit.id ? { ...h, title } : h)),
    )
    try {
      await api.updateHabit(habit.id, { title })
    } catch {
      setHabits((prev) =>
        (prev ?? []).map((h) =>
          h.id === habit.id ? { ...h, title: habit.title } : h,
        ),
      )
      onError?.(habitsCopy.error)
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !habits) return
    const oldIndex = habits.findIndex((h) => h.id === active.id)
    const newIndex = habits.findIndex((h) => h.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const previous = habits
    const next = arrayMove(habits, oldIndex, newIndex).map((h, index) => ({
      ...h,
      sortOrder: index,
    }))
    setHabits(next)
    try {
      await api.reorderHabits(next.map((h) => h.id))
    } catch {
      setHabits(previous)
      onError?.(habitsCopy.error)
    }
  }

  const summary = habitDaySummary(habits ?? [])
  const summaryLabel = habitSummaryLabel(summary.completed, summary.total)
  const hasHabits = (habits?.length ?? 0) > 0
  // Keep open when empty so Add stays reachable; otherwise honor collapse.
  const expanded = !hasHabits || !collapsed
  const habitIds = habits?.map((h) => h.id) ?? []
  const showHardLoading = loading && !habits
  const showContent = habits != null && !showHardLoading

  return (
    <section
      className={`habits-panel${expanded ? ' is-expanded' : ' is-collapsed'}${summary.total > 0 && summary.completed === summary.total ? ' is-complete' : ''}${refreshing ? ' is-refreshing' : ''}`}
      aria-label={habitsCopy.title}
      aria-busy={refreshing || loading || undefined}
    >
      <div className="habits-panel-header-bar">
        <button
          type="button"
          className="habits-panel-toggle"
          aria-expanded={expanded}
          aria-controls="habits-panel-body"
          aria-label={habitsCopy.togglePanelAria(
            expanded,
            summary.completed,
            summary.total,
          )}
          disabled={!hasHabits && !loading && !refreshing}
          onClick={() => {
            if (!hasHabits) return
            setCollapsedState(!collapsed)
          }}
        >
          <span className="habits-panel-toggle-main">
            <span className="habits-panel-chevron" aria-hidden>
              {expanded ? (
                <IconChevronDown size={14} stroke={2} />
              ) : (
                <IconChevronRight size={14} stroke={2} />
              )}
            </span>
            <span className="habits-panel-title">{habitsCopy.title}</span>
            {summary.total > 0 && (
              <span className="habits-panel-reset" title={habitsCopy.dailyReset}>
                {habitsCopy.dailyReset}
              </span>
            )}
          </span>

          <span className="habits-panel-progress">
            {summary.total > 0 && (
              <>
                <span
                  className="habits-panel-meter"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={summary.total}
                  aria-valuenow={summary.completed}
                  aria-label={habitsCopy.progressAria(
                    summary.completed,
                    summary.total,
                  )}
                >
                  <span
                    className="habits-panel-meter-fill"
                    style={{ width: `${summary.percent}%` }}
                  />
                </span>
                <span className="habits-panel-summary">{summaryLabel}</span>
              </>
            )}
          </span>
        </button>
        {onOpenHistory && (
          <button
            type="button"
            className="habits-panel-history-link"
            aria-label={habitsCopy.viewHistoryAria}
            onClick={() => onOpenHistory()}
          >
            {habitsCopy.viewHistory}
          </button>
        )}
      </div>

      <div
        id="habits-panel-body"
        className="habits-panel-body"
        hidden={!expanded}
      >
        {showHardLoading && (
          <p className="habits-panel-empty">{habitsCopy.loading}</p>
        )}

        {error && !showHardLoading && (
          <div className="habits-panel-error">
            <p>{error}</p>
            <Button variant="default" size="xs" onClick={() => void retry()}>
              {habitsCopy.retry}
            </Button>
          </div>
        )}

        {showContent && !error && habits.length === 0 && (
          <p className="habits-panel-empty">{habitsCopy.empty}</p>
        )}

        {showContent && (habits.length > 0 || !error) && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void onDragEnd(e)}
          >
            <ul className="habits-list">
              <SortableContext items={habitIds} strategy={rectSortingStrategy}>
                {habits.map((habit) => (
                  <SortableHabitRow
                    key={habit.id}
                    habit={habit}
                    busy={busy}
                    renaming={renamingId === habit.id}
                    renameDraft={renameDraft}
                    onRenameDraft={setRenameDraft}
                    onToggle={() => void toggle(habit)}
                    onBeginRename={() => beginRename(habit)}
                    onCommitRename={() => void commitRename(habit)}
                    onCancelRename={() => {
                      ignoreRenameBlur.current = true
                      setRenamingId(null)
                      setRenameDraft(habit.title)
                      window.setTimeout(() => {
                        ignoreRenameBlur.current = false
                      }, 0)
                    }}
                    onArchive={() => void archive(habit)}
                    onRenameFocus={(el) => el.select()}
                    ignoreRenameBlur={ignoreRenameBlur}
                  />
                ))}
              </SortableContext>
              <li className={`habits-add-inline${draft.trim() ? ' is-active' : ''}`}>
                <input
                  className="habits-add-input"
                  type="text"
                  value={draft}
                  placeholder={habitsCopy.addPlaceholder}
                  aria-label={habitsCopy.addAria}
                  disabled={busy}
                  onChange={(e) => setDraft(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void addHabit()
                    }
                  }}
                />
              </li>
            </ul>
          </DndContext>
        )}
      </div>
    </section>
  )
}

function SortableHabitRow({
  habit,
  busy,
  renaming,
  renameDraft,
  onRenameDraft,
  onToggle,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onArchive,
  onRenameFocus,
  ignoreRenameBlur,
}: {
  habit: Habit
  busy?: boolean
  renaming: boolean
  renameDraft: string
  onRenameDraft: (value: string) => void
  onToggle: () => void
  onBeginRename: () => void
  onCommitRename: () => void
  onCancelRename: () => void
  onArchive: () => void
  onRenameFocus: (el: HTMLInputElement) => void
  ignoreRenameBlur: { current: boolean }
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: habit.id,
    disabled: Boolean(busy) || renaming,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`habits-row${habit.completed ? ' is-done' : ''}${renaming ? ' is-renaming' : ''}${isDragging ? ' is-dragging' : ''}`}
    >
      <button
        type="button"
        className="habits-drag-handle"
        aria-label={habitsCopy.dragAria(habit.title)}
        disabled={busy || renaming}
        {...attributes}
        {...listeners}
      >
        <IconGripVertical size={12} stroke={2} aria-hidden />
      </button>
      <button
        type="button"
        className="habits-check"
        aria-pressed={habit.completed}
        aria-label={habitsCopy.toggleAria(habit.title, habit.completed)}
        disabled={busy || renaming}
        onClick={onToggle}
      >
        {habit.completed ? '✓' : ''}
      </button>
      {renaming ? (
        <TextInput
          className="habits-rename"
          size="xs"
          value={renameDraft}
          autoFocus
          aria-label={habitsCopy.renameAria(habit.title)}
          onChange={(e) => onRenameDraft(e.currentTarget.value)}
          onFocus={(e) => onRenameFocus(e.currentTarget)}
          onBlur={() => onCommitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ignoreRenameBlur.current = false
              onCommitRename()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onCancelRename()
            }
          }}
          disabled={busy}
        />
      ) : (
        <button
          type="button"
          className="habits-title"
          title={habitsCopy.renameHint}
          aria-label={`${habit.title}. ${habitsCopy.renameHint}`}
          onClick={onToggle}
          onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onBeginRename()
          }}
          disabled={busy}
        >
          {habit.title}
        </button>
      )}
      <Menu shadow="md" width={140} position="bottom-end">
        <Menu.Target>
          <button
            type="button"
            className="habits-menu-btn"
            aria-label={`${habit.title} options`}
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
          >
            <IconDotsVertical size={14} stroke={2} />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={onBeginRename}>{habitsCopy.rename}</Menu.Item>
          <Menu.Item onClick={onArchive}>{habitsCopy.archive}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </li>
  )
}
