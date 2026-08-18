import { flushSync } from 'react-dom'
import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Button } from '@mantine/core'
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconGripVertical,
  IconSelector,
  IconX,
} from '@tabler/icons-react'
import { api, type ListSort, type ListSortField } from '../api'
import { SubtaskList } from './SubtaskList'
import { RowMeta } from './RowMeta'
import { TimeControl } from './TimeControl'
import { focusCopy } from './focus-copy'
import { unlockFocusAudio } from './focus-signal'
import { nowCopy } from './now-copy'
import { taskCopy } from './task-copy'
import { notesPreviewText } from './notes-html'
import {
  PRIORITY_TAGS,
} from './tags'
import { useTagColors } from './TagColorsContext'
import {
  STATUS_OPTIONS,
  isTaskStatus,
  statusSwatch,
  type TaskStatus,
} from './status-ui'
import type { Priority, Task, ViewTab } from '../types'
import {
  appendSubtask,
  mergeSubtask,
  mergeTask,
  patchSubtaskLocal,
  removeSubtask,
  settleRunningSubtaskTimer,
} from './task-merge'
import {
  TASK_MOUSE_SENSOR_OPTIONS,
  TASK_TOUCH_SENSOR_OPTIONS,
  TaskMouseSensor,
  TaskTouchSensor,
} from './drag-sensors'
import { subtaskPlainText } from './subtask-html'

const ICON = { size: 14, stroke: 1.5 } as const
const SORT_ICON = { size: 12, stroke: 2 } as const

type SortableColumn = Exclude<ListSortField, 'manual'>

type RunOptions = {
  success?: string
  refresh?: boolean
  busy?: boolean
  refreshStats?: boolean
}

type RunFn = (
  action: () => Promise<void>,
  successOrOpts?: string | RunOptions,
) => Promise<void>

/** Explicit true/false wins; otherwise default open when the task already has items. */
function isChecklistOpen(
  taskId: string,
  total: number,
  expanded: Record<string, boolean>,
) {
  if (expanded[taskId] === true) return true
  if (expanded[taskId] === false) return false
  return total > 0
}

function isTaskDone(task: Task, tab: ViewTab): boolean {
  return tab === 'today' ? Boolean(task.entry?.completed) : task.status === 'done'
}

function nextListSort(current: ListSort, field: SortableColumn): ListSort {
  if (current.field === field) {
    return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  }
  return { field, dir: 'asc' }
}

function labelForSortField(field: SortableColumn): string {
  if (field === 'category') return taskCopy.frequency
  if (field === 'project') return taskCopy.project
  return taskCopy.priority
}

type Props = {
  tab: ViewTab
  date: string
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  listSort: ListSort
  setListSort: Dispatch<SetStateAction<ListSort>>
  busy: boolean
  tick: number
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  liveHours: (task: Task, tick: number) => number
  onRun: RunFn
  onDelete: (task: Task) => void
  onError: (msg: string) => void
  onToast: (msg: string) => void
  onRefresh: () => Promise<void>
  onOpenTask: (task: Task) => void
  onFocusEnter?: (taskId: string, force?: boolean) => void
  selectedTaskId?: string | null
  /** When true, hide frequency/project sort columns (Projects chip). */
  compactHeader?: boolean
  /** Rebuild full ordered ids when this list is a section subset. */
  rebuildOrderedIds?: (sectionOrderedIds: string[]) => string[]
}

export function SortableTaskList({
  tab,
  date,
  tasks,
  setTasks,
  listSort,
  setListSort,
  busy,
  tick,
  expanded,
  setExpanded,
  liveHours,
  onRun,
  onDelete,
  onError,
  onToast,
  onRefresh,
  onOpenTask,
  onFocusEnter,
  selectedTaskId,
  compactHeader = false,
  rebuildOrderedIds,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeWidth, setActiveWidth] = useState<number | null>(null)
  const [showDone, setShowDone] = useState(false)
  const sensors = useSensors(
    useSensor(TaskMouseSensor, TASK_MOUSE_SENSOR_OPTIONS),
    useSensor(TaskTouchSensor, TASK_TOUCH_SENSOR_OPTIONS),
  )

  const openTasks = tasks.filter((t) => !isTaskDone(t, tab))
  const doneTasks = tasks.filter((t) => isTaskDone(t, tab))
  const visibleTasks = showDone ? [...openTasks, ...doneTasks] : openTasks

  const activeTask = activeId
    ? visibleTasks.find((t) => t.id === activeId) ?? null
    : null
  const activeIndex = activeTask
    ? visibleTasks.findIndex((t) => t.id === activeTask.id)
    : -1

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setActiveWidth(null)
    if (!over || active.id === over.id) return

    const oldIndex = visibleTasks.findIndex((t) => t.id === active.id)
    const newIndex = visibleTasks.findIndex((t) => t.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reorderedVisible = arrayMove(visibleTasks, oldIndex, newIndex)
    const next = (
      showDone ? reorderedVisible : [...reorderedVisible, ...doneTasks]
    ).map((t, i) => ({
      ...t,
      sortOrder: i,
    }))
    setTasks(next)
    setListSort({ field: 'manual', dir: 'asc' })

    try {
      const sectionIds = next.map((t) => t.id)
      const persistIds = rebuildOrderedIds
        ? rebuildOrderedIds(sectionIds)
        : sectionIds
      const res = await api.reorderTasks(persistIds)
      setListSort(res.listSort)
      onToast('List order saved')
    } catch {
      onError('Couldn’t save list order. Reloading…')
      await onRefresh()
    }
  }

  async function onSortColumn(field: SortableColumn) {
    const next = nextListSort(listSort, field)
    setListSort(next)
    try {
      const res = await api.sortTasks(next.field, next.dir)
      setListSort(res.listSort)
      const order = new Map(res.orderedIds.map((id, i) => [id, i]))
      setTasks((prev) =>
        [...prev]
          .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
          .map((t, i) => ({ ...t, sortOrder: i })),
      )
      onToast(`Sorted by ${labelForSortField(field)}`)
    } catch {
      onError('Couldn’t sort the list. Reloading…')
      await onRefresh()
    }
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    const width = event.active.rect.current.initial?.width
    setActiveWidth(typeof width === 'number' ? width : null)
  }

  const allChecklistsOpen =
    visibleTasks.length > 0 &&
    visibleTasks.every((t) =>
      isChecklistOpen(
        t.id,
        t.subtaskProgress?.total ?? t.subtasks?.length ?? 0,
        expanded,
      ),
    )
  const anyChecklistOpen = visibleTasks.some((t) =>
    isChecklistOpen(
      t.id,
      t.subtaskProgress?.total ?? t.subtasks?.length ?? 0,
      expanded,
    ),
  )

  function expandAllChecklists() {
    setExpanded((prev) => {
      const next = { ...prev }
      for (const t of visibleTasks) next[t.id] = true
      return next
    })
  }

  function collapseAllChecklists() {
    setExpanded((prev) => {
      const next = { ...prev }
      for (const t of visibleTasks) next[t.id] = false
      return next
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={(e) => void onDragEnd(e)}
      onDragCancel={() => {
        setActiveId(null)
        setActiveWidth(null)
      }}
    >
      <div className="task-list-header task-row" role="row">
        <span className="task-list-header-gutter" aria-hidden="true" />
        <span className="task-list-header-gutter" aria-hidden="true" />
        <div className="task-list-header-task-cell">
          <span className="task-list-header-task">Task</span>
          {visibleTasks.length > 0 && (
            <div className="task-list-expand-group" role="group" aria-label="Checklists">
              <button
                type="button"
                className="task-list-expand-btn"
                disabled={busy || allChecklistsOpen}
                aria-label={taskCopy.expandAllAria}
                onClick={expandAllChecklists}
              >
                {taskCopy.expandAllChecklists}
              </button>
              <span className="task-list-expand-sep" aria-hidden>
                /
              </span>
              <button
                type="button"
                className="task-list-expand-btn"
                disabled={busy || !anyChecklistOpen}
                aria-label={taskCopy.collapseAllAria}
                onClick={collapseAllChecklists}
              >
                {taskCopy.collapseAllChecklists}
              </button>
            </div>
          )}
        </div>
        {compactHeader ? (
          <span className="task-list-header-status task-meta-category" role="columnheader">
            {taskCopy.frequency}
          </span>
        ) : (
          <SortColumnButton
            field="category"
            label={taskCopy.frequency}
            listSort={listSort}
            disabled={busy}
            className="task-meta-category"
            onClick={() => void onSortColumn('category')}
          />
        )}
        {compactHeader ? (
          <span className="task-list-header-status task-meta-project" role="columnheader">
            {taskCopy.project}
          </span>
        ) : (
          <SortColumnButton
            field="project"
            label={taskCopy.project}
            listSort={listSort}
            disabled={busy}
            className="task-meta-project"
            onClick={() => void onSortColumn('project')}
          />
        )}
        <SortColumnButton
          field="priority"
          label={taskCopy.priority}
          listSort={listSort}
          disabled={busy}
          className="task-meta-priority"
          onClick={() => void onSortColumn('priority')}
        />
        <span className="task-list-header-status task-meta-status" role="columnheader">
          {taskCopy.status}
        </span>
        <span className="task-list-header-controls" aria-hidden="true" />
      </div>
      <SortableContext
        items={visibleTasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="task-list-body">
          {openTasks.map((task, index) => {
            const total = task.subtaskProgress?.total ?? task.subtasks?.length ?? 0
            return (
              <SortableTaskBlock
                key={task.id}
                task={task}
                index={index}
                tab={tab}
                date={date}
                busy={busy}
                tick={tick}
                isOpen={isChecklistOpen(task.id, total, expanded)}
                liveHours={liveHours}
                onToggleExpand={() =>
                  setExpanded((e) => {
                    const open = isChecklistOpen(task.id, total, e)
                    return { ...e, [task.id]: !open }
                  })
                }
                onRun={onRun}
                onDelete={onDelete}
                setExpanded={setExpanded}
                setTasks={setTasks}
                onToast={onToast}
                onError={onError}
                onRefresh={onRefresh}
                onOpenTask={onOpenTask}
                onFocusEnter={onFocusEnter}
                selected={selectedTaskId === task.id}
              />
            )
          })}
          {doneTasks.length > 0 && (
            <button
              type="button"
              className="task-list-done-toggle"
              aria-expanded={showDone}
              aria-label={showDone ? taskCopy.hideDoneAria : taskCopy.showDoneAria}
              onClick={() => setShowDone((v) => !v)}
            >
              {showDone ? taskCopy.hideDone : taskCopy.showDone(doneTasks.length)}
            </button>
          )}
          {showDone &&
            doneTasks.map((task, index) => {
              const total = task.subtaskProgress?.total ?? task.subtasks?.length ?? 0
              return (
                <SortableTaskBlock
                  key={task.id}
                  task={task}
                  index={openTasks.length + index}
                  tab={tab}
                  date={date}
                  busy={busy}
                  tick={tick}
                  isOpen={isChecklistOpen(task.id, total, expanded)}
                  liveHours={liveHours}
                  onToggleExpand={() =>
                    setExpanded((e) => {
                      const open = isChecklistOpen(task.id, total, e)
                      return { ...e, [task.id]: !open }
                    })
                  }
                  onRun={onRun}
                  onDelete={onDelete}
                  setExpanded={setExpanded}
                  setTasks={setTasks}
                  onToast={onToast}
                  onError={onError}
                  onRefresh={onRefresh}
                  onOpenTask={onOpenTask}
                  onFocusEnter={onFocusEnter}
                  selected={selectedTaskId === task.id}
                />
              )
            })}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeTask ? (
          <TaskDragPreview
            task={activeTask}
            index={activeIndex >= 0 ? activeIndex : 0}
            tab={tab}
            width={activeWidth}
            isOpen={isChecklistOpen(
              activeTask.id,
              activeTask.subtaskProgress?.total ??
                activeTask.subtasks?.length ??
                0,
              expanded,
            )}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function TaskDragPreview({
  task,
  index,
  tab,
  width,
  isOpen,
}: {
  task: Task
  index: number
  tab: ViewTab
  width: number | null
  isOpen: boolean
}) {
  const { swatchFor } = useTagColors()
  const done =
    tab === 'today' ? Boolean(task.entry?.completed) : task.status === 'done'
  const running = Boolean(task.entry?.timerStartedAt)
  const doing = task.status === 'doing'
  const prog = task.subtaskProgress || { done: 0, total: 0 }
  const categorySwatch = swatchFor('category', task.category)
  const projectSwatch = swatchFor('project', task.projectTag)
  const prioritySwatch = swatchFor('priority', task.priority)
  const workflowSwatch = statusSwatch(task.status)
  const subtasks = task.subtasks || []
  const showChecklist = isOpen && subtasks.length > 0

  return (
    <div
      className={`task-block task-drag-preview${showChecklist ? ' is-expanded' : ''}${running ? ' is-running' : ''}${doing ? ' is-doing' : ''}${done ? ' is-done' : ''}`}
      style={width ? { width } : undefined}
      aria-hidden
    >
      <div className={`task-row ${done ? 'done' : ''} ${running ? 'running-row' : ''}`}>
        <span className="list-drag-handle" aria-hidden>
          <span className="task-index">{index + 1}</span>
        </span>
        <span className={`check ${done ? 'checked' : ''}`} aria-hidden />
        <div className="task-main">
          <span className="task-title">
            <span className="task-title-text">{task.title}</span>
            {prog.total > 0 && (
              <span className="subtask-chip">
                {prog.done}/{prog.total}
              </span>
            )}
          </span>
        </div>
        <span
          className="row-meta task-meta-category"
          style={{
            background: categorySwatch.bg,
            color: categorySwatch.fg,
            borderColor: categorySwatch.border,
          }}
        >
          <span className="row-meta-label">{task.category}</span>
        </span>
        <span
          className="row-meta task-meta-project"
          style={{
            background: projectSwatch.bg,
            color: projectSwatch.fg,
            borderColor: projectSwatch.border,
          }}
        >
          <span className="row-meta-label">{task.projectTag}</span>
        </span>
        <span
          className="row-meta task-meta-priority"
          style={{
            background: prioritySwatch.bg,
            color: prioritySwatch.fg,
            borderColor: prioritySwatch.border,
          }}
        >
          <span className="row-meta-label">{task.priority}</span>
        </span>
        <span
          className="row-meta task-meta-status"
          style={{
            background: workflowSwatch.bg,
            color: workflowSwatch.fg,
            borderColor: workflowSwatch.border,
          }}
        >
          <span className="row-meta-label">{workflowSwatch.label}</span>
        </span>
        <div className="task-controls task-drag-preview-controls" aria-hidden>
          {running && <span className="task-drag-preview-badge">Running</span>}
          {tab === 'today' && (
            <span className="task-drag-preview-hours">
              {(task.entry?.hours ?? 0).toFixed(1)}h
            </span>
          )}
        </div>
      </div>
      {showChecklist ? (
        <ul className="task-drag-preview-checklist">
          {subtasks.map((s) => (
            <li
              key={s.id}
              className={`task-drag-preview-check-item${s.done ? ' is-done' : ''}`}
            >
              <span className="task-drag-preview-check-box" />
              <span className="task-drag-preview-check-title">
                {subtaskPlainText(s.title) || s.title}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SortColumnButton({
  field,
  label,
  listSort,
  disabled,
  className,
  onClick,
}: {
  field: SortableColumn
  label: string
  listSort: ListSort
  disabled: boolean
  className?: string
  onClick: () => void
}) {
  const active = listSort.field === field
  return (
    <button
      type="button"
      className={`task-sort-btn ${className || ''} ${active ? 'active' : ''}`}
      disabled={disabled}
      aria-label={
        active
          ? `Sort by ${label}, currently ${listSort.dir === 'asc' ? 'ascending' : 'descending'}. Click to reverse.`
          : `Sort by ${label}`
      }
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      {active ? (
        listSort.dir === 'asc' ? (
          <IconChevronUp {...SORT_ICON} aria-hidden />
        ) : (
          <IconChevronDown {...SORT_ICON} aria-hidden />
        )
      ) : (
        <IconSelector {...SORT_ICON} aria-hidden />
      )}
    </button>
  )
}

function SortableTaskBlock({
  task,
  index,
  tab,
  date,
  busy,
  tick,
  isOpen,
  liveHours,
  onToggleExpand,
  onRun,
  onDelete,
  setExpanded,
  setTasks,
  onToast,
  onError,
  onRefresh,
  onOpenTask,
  onFocusEnter,
  selected,
}: {
  task: Task
  index: number
  tab: ViewTab
  date: string
  busy: boolean
  tick: number
  isOpen: boolean
  liveHours: (task: Task, tick: number) => number
  onToggleExpand: () => void
  onRun: RunFn
  onDelete: (task: Task) => void
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  setTasks: Dispatch<SetStateAction<Task[]>>
  onToast: (msg: string) => void
  onError: (msg: string) => void
  onRefresh: () => Promise<void>
  onOpenTask: (task: Task) => void
  onFocusEnter?: (taskId: string, force?: boolean) => void
  selected: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: busy })

  // Translate only — Transform also applies scaleX/scaleY, which squashes
  // rows when neighboring blocks have different heights (expanded checklists).
  // While dragging, freeze the source: DragOverlay owns motion (Projects pattern).
  const style = {
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    transition: isDragging ? undefined : transition,
  }

  const running = Boolean(task.entry?.timerStartedAt)
  const doing = task.status === 'doing'
  const done =
    tab === 'today' ? Boolean(task.entry?.completed) : task.status === 'done'
  const hrs = liveHours(task, tick)
  const prog = task.subtaskProgress || { done: 0, total: 0 }
  const hasNotes = Boolean(task.notes && notesPreviewText(task.notes))
  const { swatchFor, frequencies, projects } = useTagColors()
  const categorySwatch = swatchFor('category', task.category)
  const projectSwatch = swatchFor('project', task.projectTag)
  const prioritySwatch = swatchFor('priority', task.priority)
  const workflowSwatch = statusSwatch(task.status)
  const projectOptions = [
    ...projects.map((value) => ({
      value,
      label: value,
      swatch: swatchFor('project', value),
    })),
    ...(projects.includes(task.projectTag)
      ? []
      : [
          {
            value: task.projectTag,
            label: task.projectTag,
            swatch: swatchFor('project', task.projectTag),
          },
        ]),
  ]
  const frequencyOptions = [
    ...frequencies.map((value) => ({
      value,
      label: value,
      swatch: swatchFor('category', value),
    })),
    ...(frequencies.includes(task.category)
      ? []
      : [
          {
            value: task.category,
            label: task.category,
            swatch: swatchFor('category', task.category),
          },
        ]),
  ]

  const zebra = index % 2 === 1 ? ' is-alt' : ''

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-block${isOpen ? ' is-expanded' : ''}${zebra}${done ? ' is-done' : ''}${doing ? ' is-doing' : ''}${running ? ' is-running' : ''}${isDragging ? ' is-dragging-source' : ''}${selected ? ' is-selected' : ''}`}
      data-index={index + 1}
    >
      <div
        ref={setActivatorNodeRef}
        className={`task-row task-row-draggable ${done ? 'done' : ''} ${doing ? 'doing-row' : ''} ${running ? 'running-row' : ''} ${isDragging ? 'dragging-row' : ''}`}
        {...attributes}
        {...listeners}
        role="group"
        aria-roledescription="sortable"
        aria-label={`Drag to reorder ${task.title}`}
      >
        <span className="list-drag-handle" title={`#${index + 1}`} aria-hidden>
          <span className="task-index">{index + 1}</span>
          <IconGripVertical {...ICON} className="task-drag-icon" />
        </span>
        <button
          type="button"
          className={`check ${done ? 'checked' : ''}`}
          aria-label={done ? 'Mark incomplete' : 'Mark complete'}
          disabled={busy}
          data-no-dnd
          onClick={() =>
            void onRun(
              async () => {
                const updated = await api.patchDayEntry(task.id, {
                  date,
                  completed: !done,
                })
                setTasks((prev) => mergeTask(prev, updated))
              },
              { refresh: false, busy: false, refreshStats: true },
            )
          }
        />
        <div className="task-main">
          <ActionIcon
            className={`task-expand-btn${isOpen ? ' is-open' : ''}`}
            variant="subtle"
            size="sm"
            color="gray"
            aria-expanded={isOpen}
            aria-label={isOpen ? taskCopy.checklistClose : taskCopy.checklistOpen}
            title={taskCopy.checklistToggleTitle}
            data-no-dnd
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
          >
            {isOpen ? (
              <IconChevronDown {...ICON} aria-hidden />
            ) : (
              <IconChevronRight {...ICON} aria-hidden />
            )}
          </ActionIcon>
          <button
            type="button"
            className={`task-title task-title-open${selected ? ' is-selected' : ''}`}
            aria-haspopup="dialog"
            aria-label={taskCopy.openTaskAria(task.title)}
            title={taskCopy.openTask}
            onClick={() => onOpenTask(task)}
          >
            <span className="task-title-text">{task.title}</span>
            {prog.total > 0 ? (
              <span className="subtask-chip" aria-hidden="true">
                {prog.done}/{prog.total}
              </span>
            ) : null}
            {hasNotes ? (
              <span className="task-notes-dot" title={taskCopy.hasNotesHint} aria-label={taskCopy.hasNotesHint} />
            ) : null}
          </button>
        </div>
        <RowMeta
          className="task-meta-category"
          value={task.category}
          options={frequencyOptions}
          ariaLabel={taskCopy.frequency}
          swatch={categorySwatch}
          disabled={busy}
          onSelect={(value) => {
            const category = value as Task['category']
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, category } : t)),
            )
            void onRun(
              async () => {
                const updated = await api.updateTask(task.id, { category, date })
                setTasks((prev) => mergeTask(prev, updated))
              },
              { refresh: false, busy: false },
            )
          }}
        />
        <RowMeta
          className="task-meta-project"
          value={task.projectTag}
          options={projectOptions}
          ariaLabel={taskCopy.project}
          swatch={projectSwatch}
          disabled={busy}
          onSelect={(value) => {
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, projectTag: value } : t)),
            )
            void onRun(
              async () => {
                const updated = await api.updateTask(task.id, {
                  projectTag: value,
                  date,
                })
                setTasks((prev) => mergeTask(prev, updated))
              },
              { refresh: false, busy: false },
            )
          }}
        />
        <RowMeta
          className="task-meta-priority"
          value={task.priority}
          options={PRIORITY_TAGS.map((value) => ({
            value,
            label: value,
            swatch: swatchFor('priority', value),
          }))}
          ariaLabel={taskCopy.priority}
          swatch={prioritySwatch}
          disabled={busy}
          onSelect={(value) => {
            const priority = value as Priority
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, priority } : t)),
            )
            void onRun(
              async () => {
                const updated = await api.updateTask(task.id, { priority, date })
                setTasks((prev) => mergeTask(prev, updated))
              },
              { refresh: false, busy: false },
            )
          }}
        />
        <RowMeta
          className="task-meta-status"
          value={task.status}
          options={STATUS_OPTIONS}
          ariaLabel={taskCopy.status}
          swatch={workflowSwatch}
          disabled={busy}
          onSelect={(value) => {
            if (!isTaskStatus(value) || value === task.status) return
            const status = value as TaskStatus
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, status } : t)),
            )
            void onRun(
              async () => {
                const updated = await api.updateTask(task.id, { status, date })
                setTasks((prev) => mergeTask(prev, updated))
              },
              { refresh: false, busy: false, refreshStats: true },
            )
          }}
        />
        <div className="task-controls" data-no-dnd>
          {tab === 'today' ? (
            (task.subtasks?.length ?? 0) > 0 ? (
              <>
                <TimeControl
                  readOnly
                  running={running}
                  hours={hrs}
                  busy={busy}
                />
                {running && onFocusEnter ? (
                  <button
                    type="button"
                    className="focus-reentry"
                    disabled={busy}
                    onClick={() => onFocusEnter(task.id, true)}
                  >
                    {focusCopy.openFocus}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <TimeControl
                  running={running}
                  hours={hrs}
                  busy={busy}
                  onToggleTimer={() => {
                    if (!running) void unlockFocusAudio()
                    void onRun(
                      async () => {
                        const updated = await api.patchDayEntry(task.id, {
                          date,
                          timerAction: running ? 'stop' : 'start',
                        })
                        flushSync(() => {
                          setTasks((prev) =>
                            mergeTask(prev, updated, {
                              clearOtherTimers: !running,
                            }),
                          )
                        })
                        if (!running) onFocusEnter?.(task.id, true)
                      },
                      {
                        success: running ? 'Timer stopped' : 'Timer started',
                        refresh: false,
                        busy: false,
                        refreshStats: true,
                      },
                    )
                  }}
                  onHoursChange={(value) =>
                    void onRun(
                      async () => {
                        const updated = await api.patchDayEntry(task.id, {
                          date,
                          hours: value,
                        })
                        setTasks((prev) => mergeTask(prev, updated))
                      },
                      { refresh: false, busy: false, refreshStats: true },
                    )
                  }
                />
                {running && onFocusEnter ? (
                  <button
                    type="button"
                    className="focus-reentry"
                    disabled={busy}
                    onClick={() => onFocusEnter(task.id, true)}
                  >
                    {focusCopy.openFocus}
                  </button>
                ) : null}
              </>
            )
          ) : (
            <Button
              variant="light"
              color="gray"
              size="xs"
              disabled={busy}
              onClick={() =>
                void onRun(async () => {
                  await api.scheduleTask(task.id, date)
                }, 'Added to today')
              }
            >
              + Today
            </Button>
          )}
          <div className="row-actions">
            <ActionIcon
              size="sm"
              color="red"
              aria-label="Delete task"
              onClick={() => onDelete(task)}
            >
              <IconX {...ICON} />
            </ActionIcon>
          </div>
        </div>
      </div>
      {isOpen && (
        <SubtaskList
          taskId={task.id}
          subtasks={task.subtasks || []}
          busy={busy}
          autoFocusAdd={prog.total === 0}
          showTimers={tab === 'today'}
          timerSubtaskId={task.entry?.timerSubtaskId ?? null}
          timerStartedAt={task.entry?.timerStartedAt ?? null}
          tick={tick}
          onToggleTimer={(subtaskId, action) => {
            if (action === 'start') void unlockFocusAudio()
            void onRun(
              async () => {
                const updated = await api.patchDayEntry(task.id, {
                  date,
                  timerAction: action,
                  subtaskId: action === 'start' ? subtaskId : undefined,
                })
                // Commit timer onto the task before opening Focus so the
                // clear-effect doesn't see a running id without timerStartedAt.
                flushSync(() => {
                  setTasks((prev) =>
                    mergeTask(prev, updated, {
                      clearOtherTimers: action === 'start',
                    }),
                  )
                })
                if (action === 'start') onFocusEnter?.(task.id, true)
              },
              {
                success: action === 'stop' ? 'Timer stopped' : 'Timer started',
                refresh: false,
                busy: false,
                refreshStats: true,
              },
            )
          }}
          onToggle={(id, doneVal) => {
            const shouldStop =
              doneVal &&
              Boolean(task.entry?.timerStartedAt) &&
              task.entry?.timerSubtaskId === id
            setTasks((prev) => {
              let next = patchSubtaskLocal(prev, task.id, id, { done: doneVal })
              if (shouldStop) {
                next = settleRunningSubtaskTimer(next, task.id, id)
              }
              return next
            })
            void onRun(
              async () => {
                if (shouldStop) {
                  const stopped = await api.patchDayEntry(task.id, {
                    date,
                    timerAction: 'stop',
                  })
                  setTasks((prev) => mergeTask(prev, stopped))
                }
                const updated = await api.updateSubtask(id, {
                  done: doneVal,
                  date,
                })
                setTasks((prev) => mergeSubtask(prev, task.id, updated))
              },
              { refresh: false, busy: false, refreshStats: true },
            )
          }}
          onTogglePin={(id, pinned) => {
            setTasks((prev) => patchSubtaskLocal(prev, task.id, id, { pinned }))
            void onRun(
              async () => {
                const updated = await api.updateSubtask(id, { pinned })
                setTasks((prev) => mergeSubtask(prev, task.id, updated))
              },
              {
                success: pinned ? nowCopy.pinnedToast : nowCopy.unpinnedToast,
                refresh: false,
                busy: false,
              },
            )
          }}
          onAdd={(title) =>
            void onRun(
              async () => {
                const created = await api.addSubtask(task.id, title)
                setTasks((prev) => appendSubtask(prev, task.id, created))
                setExpanded((e) => ({ ...e, [task.id]: true }))
              },
              {
                success: 'Checklist item added',
                refresh: false,
                busy: false,
                refreshStats: true,
              },
            )
          }
          onRename={(id, title) => {
            setTasks((prev) => patchSubtaskLocal(prev, task.id, id, { title }))
            void onRun(
              async () => {
                const updated = await api.updateSubtask(id, { title })
                setTasks((prev) => mergeSubtask(prev, task.id, updated))
              },
              { refresh: false, busy: false },
            )
          }}
          onDelete={(id) => {
            setTasks((prev) => removeSubtask(prev, task.id, id))
            void onRun(
              async () => {
                await api.deleteSubtask(id)
              },
              {
                success: 'Checklist item removed',
                refresh: false,
                busy: false,
                refreshStats: true,
              },
            )
          }}
          onReorder={async (orderedIds) => {
            const byId = new Map((task.subtasks || []).map((s) => [s.id, s]))
            const nextSubs = orderedIds
              .map((id, i) => {
                const s = byId.get(id)
                return s ? { ...s, position: i } : null
              })
              .filter((s): s is NonNullable<typeof s> => Boolean(s))
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, subtasks: nextSubs } : t)),
            )
            try {
              await api.reorderSubtasks(task.id, orderedIds)
              onToast('Checklist order saved')
            } catch {
              onError('Couldn’t save checklist order. Reloading…')
              await onRefresh()
              throw new Error('reorder failed')
            }
          }}
        />
      )}
    </div>
  )
}
