import {
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ActionIcon, Button, TextInput } from '@mantine/core'
import {
  IconChevronLeft,
  IconChevronRight,
  IconFocus2,
  IconNotes,
  IconPlus,
} from '@tabler/icons-react'
import { api } from '../api'
import type { Task, ViewTab } from '../types'
import { notesPreviewText } from './notes-html'
import { projectsCopy } from './projects-copy'
import {
  buildProjectBoard,
  dropId,
  isBandDropId,
  parseDropId,
  projectTagKey,
} from './projects-board'
import {
  STATUS_OPTIONS,
  statusSwatch,
  type TaskStatus,
  isTaskStatus,
} from './status-ui'
import { useTagColors } from './TagColorsContext'
import { taskCopy } from './task-copy'
import { focusCopy } from './focus-copy'
import { unlockFocusAudio } from './focus-signal'
import { TASK_DRAG_DISTANCE, TaskPointerSensor } from './drag-sensors'

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

type Props = {
  tab: ViewTab
  date: string
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  busy: boolean
  onRun: RunFn
  onError: (msg: string) => void
  onToast: (msg: string) => void
  onRefresh: () => Promise<void>
  onOpenTask: (task: Task) => void
  onFocusEnter?: (taskId: string, force?: boolean) => void
  selectedTaskId?: string | null
  addToToday: boolean
  notesOpen: boolean
  notesCount?: number
  onToggleNotes: () => void
  showNotesToggle?: boolean
}

/**
 * Prefer the band under the pointer. Fall back to nearest band only —
 * never let full-height neighbor columns steal the drop on a tiny move.
 */
const projectBoardCollision: CollisionDetection = (args) => {
  const bands = args.droppableContainers.filter((c) => isBandDropId(c.id))
  const bandArgs = { ...args, droppableContainers: bands }
  const pointerHits = pointerWithin(bandArgs)
  if (pointerHits.length > 0) return pointerHits
  return closestCenter(bandArgs)
}

function bandDraftKey(projectKey: string, status: TaskStatus) {
  return `${projectKey}::${status}`
}

export function ProjectsBoard({
  tab,
  date,
  tasks,
  setTasks,
  busy,
  onRun,
  onError,
  onToast,
  onRefresh,
  onOpenTask,
  onFocusEnter,
  selectedTaskId,
  addToToday,
  notesOpen,
  notesCount = 0,
  onToggleNotes,
  showNotesToggle = true,
}: Props) {
  const { projects, addTag, swatchFor } = useTagColors()
  const [addingProject, setAddingProject] = useState(false)
  const [newProject, setNewProject] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeWidth, setActiveWidth] = useState<number | null>(null)

  const columns = useMemo(
    () => buildProjectBoard(tasks, projects),
    [tasks, projects],
  )

  const sensors = useSensors(
    useSensor(TaskPointerSensor, {
      activationConstraint: { distance: TASK_DRAG_DISTANCE },
    }),
  )

  const activeTask = activeId
    ? tasks.find((t) => t.id === activeId) ?? null
    : null

  function confirmAddProject() {
    const name = newProject.trim()
    if (!name) return
    addTag('project', name)
    setNewProject('')
    setAddingProject(false)
  }

  async function addTaskToProject(projectTag: string, status: TaskStatus = 'todo') {
    const draftKey = bandDraftKey(projectTag, status)
    const title = (drafts[draftKey] || '').trim()
    if (!title) return
    await onRun(async () => {
      await api.createTask({
        title,
        category: 'Projects',
        projectTag,
        status,
        addToToday,
        date,
      })
      setDrafts((prev) => ({ ...prev, [draftKey]: '' }))
    }, 'Task added')
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
    const width = event.active.rect.current.initial?.width
    setActiveWidth(typeof width === 'number' ? width : null)
  }

  function clearDrag() {
    setActiveId(null)
    setActiveWidth(null)
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    clearDrag()
    if (!over) return

    const taskId = String(active.id)
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    const target = parseDropId(String(over.id))
    if (!target) return

    const nextProject = target.projectKey
    const nextStatus = target.status
    const prevProject = projectTagKey(task)
    const prevStatus = isTaskStatus(task.status) ? task.status : 'todo'
    if (nextProject === prevProject && nextStatus === prevStatus) return

    const snapshot = tasks
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, projectTag: nextProject, status: nextStatus }
          : t,
      ),
    )

    try {
      const patch: { projectTag?: string; status?: TaskStatus; date: string } = {
        date,
      }
      if (nextProject !== prevProject) patch.projectTag = nextProject
      if (nextStatus !== prevStatus) patch.status = nextStatus
      await api.updateTask(taskId, patch)
      onToast('Board updated')
    } catch {
      setTasks(snapshot)
      onError('Couldn’t save the move. Reloading…')
      await onRefresh()
    }
  }

  void tab

  return (
    <div className="projects-board" aria-label={projectsCopy.boardAria}>
      <div className="projects-board-toolbar">
        {addingProject ? (
          <div className="projects-add-row">
            <TextInput
              style={{ flex: 1, maxWidth: 280 }}
              value={newProject}
              placeholder={projectsCopy.addProjectPlaceholder}
              aria-label={projectsCopy.addProjectAria}
              autoFocus
              size="xs"
              onChange={(e) => setNewProject(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddProject()
                if (e.key === 'Escape') {
                  setAddingProject(false)
                  setNewProject('')
                }
              }}
              disabled={busy}
            />
            <Button
              size="compact-xs"
              variant="filled"
              color="dark"
              disabled={busy || !newProject.trim()}
              onClick={confirmAddProject}
            >
              {projectsCopy.addProjectConfirm}
            </Button>
            <Button
              size="compact-xs"
              variant="default"
              disabled={busy}
              onClick={() => {
                setAddingProject(false)
                setNewProject('')
              }}
            >
              {projectsCopy.addProjectCancel}
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="compact-sm"
            leftSection={<IconPlus size={14} stroke={1.75} />}
            onClick={() => setAddingProject(true)}
          >
            {projectsCopy.addProject}
          </Button>
        )}

        {showNotesToggle ? (
          <button
            type="button"
            className={`projects-notes-slim${notesOpen ? ' is-open' : ''}`}
            aria-pressed={notesOpen}
            aria-label={projectsCopy.notesToggleAria(notesOpen, notesCount)}
            onClick={onToggleNotes}
          >
            <IconNotes size={15} stroke={1.75} aria-hidden />
            <span>{notesOpen ? projectsCopy.closeNotes : projectsCopy.openNotes}</span>
            {!notesOpen && notesCount > 0 ? (
              <span className="projects-notes-slim-count">{notesCount}</span>
            ) : null}
            <span className="projects-notes-slim-chevron" aria-hidden>
              {notesOpen ? (
                <IconChevronLeft size={14} stroke={1.75} />
              ) : (
                <IconChevronRight size={14} stroke={1.75} />
              )}
            </span>
          </button>
        ) : (
          <span />
        )}
      </div>

      {columns.length === 0 ? (
        <div className="projects-board-empty" role="status">
          <strong>{projectsCopy.boardEmpty}</strong>
          <p>{projectsCopy.boardEmptyHint}</p>
          {!addingProject ? (
            <Button
              variant="filled"
              color="dark"
              size="compact-sm"
              leftSection={<IconPlus size={14} stroke={1.75} />}
              onClick={() => setAddingProject(true)}
            >
              {projectsCopy.emptyBoardCta}
            </Button>
          ) : null}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={projectBoardCollision}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
          onDragCancel={clearDrag}
        >
          <div className="projects-board-scroll">
            {columns.map((col) => {
              const headerSwatch = swatchFor('project', col.label)
              const colStyle = {
                '--project-accent': headerSwatch.border,
                '--project-accent-soft': headerSwatch.bg,
                '--project-accent-ink': headerSwatch.fg,
              } as CSSProperties
              return (
                <section
                  key={col.key}
                  className="projects-board-col"
                  style={colStyle}
                  aria-label={`${col.label}, ${projectsCopy.sectionCountAria(col.items.length)}`}
                >
                  <header className="projects-board-col-head">
                    <span
                      className="projects-board-col-swatch"
                      style={{
                        background: headerSwatch.bg,
                        borderColor: headerSwatch.border,
                      }}
                      aria-hidden
                    />
                    <h3 className="projects-board-col-title">{col.label}</h3>
                    <span
                      className="projects-board-col-count"
                      aria-label={projectsCopy.sectionCountAria(col.items.length)}
                    >
                      {projectsCopy.sectionCount(col.items.length)}
                    </span>
                  </header>

                  <div className="projects-board-col-body">
                    {col.bands.map((band) => {
                      const label =
                        STATUS_OPTIONS.find((o) => o.value === band.status)
                          ?.label ?? band.status
                      const sw = statusSwatch(band.status)
                      const draftKey = bandDraftKey(col.key, band.status)
                      return (
                        <StatusBand
                          key={band.status}
                          projectKey={col.key}
                          projectLabel={col.label}
                          status={band.status}
                          label={label}
                          swatchFg={sw.fg}
                          tasks={band.items}
                          busy={busy}
                          draft={drafts[draftKey] ?? ''}
                          onDraftChange={(value) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [draftKey]: value,
                            }))
                          }
                          onAdd={() =>
                            void addTaskToProject(col.key, band.status)
                          }
                          selectedTaskId={selectedTaskId}
                          onOpenTask={onOpenTask}
                          onFocusEnter={onFocusEnter}
                        />
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeTask ? (
              <ProjectCardOverlay task={activeTask} width={activeWidth} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function StatusBand({
  projectKey,
  projectLabel,
  status,
  label,
  swatchFg,
  tasks,
  busy,
  draft,
  onDraftChange,
  onAdd,
  selectedTaskId,
  onOpenTask,
  onFocusEnter,
}: {
  projectKey: string
  projectLabel: string
  status: TaskStatus
  label: string
  swatchFg: string
  tasks: Task[]
  busy: boolean
  draft: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  selectedTaskId?: string | null
  onOpenTask: (task: Task) => void
  onFocusEnter?: (taskId: string, force?: boolean) => void
}) {
  const id = dropId(projectKey, status)
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: 'band', projectKey, status },
  })

  return (
    <div
      ref={setNodeRef}
      className={`projects-board-band${isOver ? ' is-over' : ''}${tasks.length === 0 ? ' is-empty' : ''}`}
    >
      <div className="projects-board-band-label" style={{ color: swatchFg }}>
        <span className="projects-board-band-dot" aria-hidden />
        {label}
        <span className="projects-board-band-count">{tasks.length}</span>
      </div>
      <div className="projects-board-band-cards">
        {tasks.map((task) => (
          <ProjectCard
            key={task.id}
            task={task}
            busy={busy}
            selected={selectedTaskId === task.id}
            onOpenTask={onOpenTask}
            onFocusEnter={onFocusEnter}
          />
        ))}
        <div className="projects-board-band-add" data-no-dnd>
          <TextInput
            size="xs"
            value={draft}
            placeholder={projectsCopy.bandAddPlaceholder}
            aria-label={projectsCopy.bandAddAria(projectLabel, label)}
            data-no-dnd
            onChange={(e) => onDraftChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAdd()
            }}
            disabled={busy}
          />
        </div>
      </div>
    </div>
  )
}

function ProjectCard({
  task,
  busy,
  selected,
  onOpenTask,
  onFocusEnter,
}: {
  task: Task
  busy: boolean
  selected: boolean
  onOpenTask: (task: Task) => void
  onFocusEnter?: (taskId: string, force?: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: {
      type: 'card',
      projectKey: projectTagKey(task),
      status: isTaskStatus(task.status) ? task.status : 'todo',
    },
    disabled: busy,
  })
  const { swatchFor } = useTagColors()
  const prioritySwatch = swatchFor('priority', task.priority)
  const hasNotes = Boolean(task.notes && notesPreviewText(task.notes))
  const prog = task.subtaskProgress || { done: 0, total: 0 }

  return (
    <article
      ref={setNodeRef}
      className={`projects-board-card projects-board-card-draggable${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      {...attributes}
      {...listeners}
      role="group"
      aria-roledescription="draggable"
      aria-label={projectsCopy.dragCardAria(task.title)}
    >
      <span className="projects-board-card-grip" aria-hidden>
        ⠿
      </span>
      <div className="projects-board-card-main">
        <button
          type="button"
          className="projects-board-card-open"
          onClick={() => onOpenTask(task)}
        >
          <span className="projects-board-card-title">{task.title}</span>
        </button>
        <div className="projects-board-card-meta">
          <span
            className="projects-board-card-priority"
            style={{
              background: prioritySwatch.bg,
              color: prioritySwatch.fg,
              borderColor: prioritySwatch.border,
            }}
          >
            {task.priority}
          </span>
          {prog.total > 0 ? (
            <span className="projects-board-card-check">
              {prog.done}/{prog.total}
            </span>
          ) : null}
          {hasNotes ? (
            <span
              className="projects-board-card-notes"
              title={taskCopy.hasNotesHint}
              aria-label={taskCopy.hasNotesHint}
            >
              <IconNotes size={12} stroke={1.75} />
            </span>
          ) : null}
          {onFocusEnter ? (
            <ActionIcon
              size="xs"
              variant="subtle"
              className="projects-board-card-focus"
              aria-label={focusCopy.openFocus}
              data-no-dnd
              onClick={(e) => {
                e.stopPropagation()
                unlockFocusAudio()
                onFocusEnter(task.id, true)
              }}
            >
              <IconFocus2 size={13} stroke={1.75} />
            </ActionIcon>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ProjectCardOverlay({
  task,
  width,
}: {
  task: Task
  width: number | null
}) {
  const { swatchFor } = useTagColors()
  const prioritySwatch = swatchFor('priority', task.priority)
  const prog = task.subtaskProgress || { done: 0, total: 0 }

  return (
    <div
      className="projects-board-card is-overlay"
      style={width ? { width } : undefined}
      aria-hidden
    >
      <span className="projects-board-card-grip" aria-hidden>
        ⠿
      </span>
      <div className="projects-board-card-main">
        <span className="projects-board-card-title">{task.title}</span>
        <div className="projects-board-card-meta">
          <span
            className="projects-board-card-priority"
            style={{
              background: prioritySwatch.bg,
              color: prioritySwatch.fg,
              borderColor: prioritySwatch.border,
            }}
          >
            {task.priority}
          </span>
          {prog.total > 0 ? (
            <span className="projects-board-card-check">
              {prog.done}/{prog.total}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
