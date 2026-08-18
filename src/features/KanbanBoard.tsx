import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ActionIcon, Button, Group, Select, TextInput } from '@mantine/core'
import { api } from '../api'
import type { BoardColumn, Priority, Task } from '../types'
import { notesCopy } from './notes-copy'

const COLUMN_COLORS = ['#66758c', '#2b63e3', '#14965c', '#c69112', '#d13b3b', '#0f8a8a', '#5b45b8']

type Props = {
  date: string
  busy: boolean
  onToast: (msg: string) => void
  onError: (msg: string) => void
  onOpenNotes: (task: Task) => void
}

export function KanbanBoard({ date, busy, onToast, onError, onOpenNotes }: Props) {
  const [columns, setColumns] = useState<BoardColumn[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeColumn, setActiveColumn] = useState<BoardColumn | null>(null)
  const [newColumnName, setNewColumnName] = useState('')
  const [addingCardFor, setAddingCardFor] = useState<string | null>(null)
  const [cardDraft, setCardDraft] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  async function refresh() {
    setLoading(true)
    try {
      const board = await api.getBoard()
      setColumns(board.columns)
      setTasks(board.tasks)
    } catch {
      onError('Couldn’t load the board. Try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const tasksByColumn = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const col of columns) map[col.id] = []
    for (const task of tasks) {
      const colId = task.columnId || columns[0]?.id
      if (!colId) continue
      if (!map[colId]) map[colId] = []
      map[colId].push(task)
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => a.boardSort - b.boardSort)
    }
    return map
  }, [columns, tasks])

  function findColumnOfTask(taskId: string) {
    return tasks.find((t) => t.id === taskId)?.columnId ?? null
  }

  async function persistMove(
    taskId: string,
    columnId: string,
    orderedIds: string[],
  ) {
    try {
      await api.moveTask({
        taskId,
        columnId,
        orderedTaskIds: orderedIds,
        date,
      })
      onToast('Board updated')
    } catch {
      onError('Couldn’t save the move. Reloading…')
      await refresh()
    }
  }

  function onDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type
    if (type === 'task') {
      setActiveTask(tasks.find((t) => t.id === event.active.id) ?? null)
    } else if (type === 'column') {
      setActiveColumn(columns.find((c) => c.id === event.active.id) ?? null)
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || active.data.current?.type !== 'task') return

    const activeId = String(active.id)
    const overId = String(over.id)
    const fromCol = findColumnOfTask(activeId)
    let toCol =
      over.data.current?.type === 'column'
        ? overId
        : over.data.current?.type === 'task'
          ? findColumnOfTask(overId)
          : over.data.current?.columnId

    if (!fromCol || !toCol || fromCol === toCol) return

    setTasks((prev) => {
      const moving = prev.find((t) => t.id === activeId)
      if (!moving) return prev
      const without = prev.filter((t) => t.id !== activeId)
      const updated = { ...moving, columnId: toCol }
      const inTarget = without.filter((t) => t.columnId === toCol)
      const overIndex = inTarget.findIndex((t) => t.id === overId)
      const insertAt = overIndex >= 0 ? overIndex : inTarget.length
      const nextTarget = [...inTarget]
      nextTarget.splice(insertAt, 0, updated)
      const others = without.filter((t) => t.columnId !== toCol)
      return [
        ...others,
        ...nextTarget.map((t, i) => ({ ...t, boardSort: i, columnId: toCol })),
      ]
    })
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTask(null)
    setActiveColumn(null)
    if (!over) return

    if (active.data.current?.type === 'column') {
      const oldIndex = columns.findIndex((c) => c.id === active.id)
      const newIndex = columns.findIndex((c) => c.id === over.id)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return
      const next = arrayMove(columns, oldIndex, newIndex).map((c, i) => ({
        ...c,
        position: i,
      }))
      setColumns(next)
      try {
        await api.reorderColumns(next.map((c) => c.id))
        onToast('Columns reordered')
      } catch {
        onError('Couldn’t reorder columns.')
        await refresh()
      }
      return
    }

    if (active.data.current?.type !== 'task') return
    const activeId = String(active.id)
    const overId = String(over.id)
    const columnId =
      over.data.current?.type === 'column'
        ? overId
        : over.data.current?.type === 'task'
          ? findColumnOfTask(overId)
          : over.data.current?.columnId

    if (!columnId) return

    const columnTasks = tasks
      .filter((t) => t.columnId === columnId || t.id === activeId)
      .map((t) => (t.id === activeId ? { ...t, columnId } : t))
      .sort((a, b) => a.boardSort - b.boardSort)

    let ordered = columnTasks.map((t) => t.id)
    if (over.data.current?.type === 'task' && overId !== activeId) {
      const oldIndex = ordered.indexOf(activeId)
      const newIndex = ordered.indexOf(overId)
      if (oldIndex >= 0 && newIndex >= 0) {
        ordered = arrayMove(ordered, oldIndex, newIndex)
      }
    }

    setTasks((prev) =>
      prev.map((t) => {
        const idx = ordered.indexOf(t.id)
        if (idx >= 0) return { ...t, columnId, boardSort: idx }
        return t
      }),
    )

    await persistMove(activeId, columnId, ordered)
  }

  async function addColumn() {
    const name = newColumnName.trim()
    if (!name) return
    try {
      const col = await api.createColumn({
        name,
        color: COLUMN_COLORS[columns.length % COLUMN_COLORS.length],
      })
      setColumns((c) => [...c, col])
      setNewColumnName('')
      onToast('Column added')
    } catch {
      onError('Couldn’t add column.')
    }
  }

  async function renameColumn(id: string, name: string) {
    try {
      const col = await api.updateColumn(id, { name })
      setColumns((cols) => cols.map((c) => (c.id === id ? col : c)))
    } catch {
      onError('Couldn’t rename column.')
    }
  }

  async function recolorColumn(id: string, color: string) {
    try {
      const col = await api.updateColumn(id, { color })
      setColumns((cols) => cols.map((c) => (c.id === id ? col : c)))
    } catch {
      onError('Couldn’t update column color.')
    }
  }

  async function setColumnRole(
    id: string,
    role: 'backlog' | 'doing' | 'done' | 'custom',
  ) {
    try {
      const col = await api.updateColumn(id, { role })
      setColumns((cols) => cols.map((c) => (c.id === id ? col : c)))
      await refresh()
      onToast('Column role updated')
    } catch {
      onError('Couldn’t update column role.')
    }
  }

  async function removeColumn(id: string) {
    if (columns.length <= 1) {
      onError('Keep at least one column.')
      return
    }
    const ok = window.confirm(
      'Delete this column? Cards will move to Backlog (or the first remaining column).',
    )
    if (!ok) return
    try {
      await api.deleteColumn(id)
      await refresh()
      onToast('Column deleted')
    } catch {
      onError('Couldn’t delete column.')
    }
  }

  async function addCard(columnId: string) {
    const title = cardDraft.trim()
    if (!title) return
    try {
      const task = await api.createTask({
        title,
        columnId,
        addToToday: false,
        category: 'Daily',
      })
      setTasks((t) => [...t, task])
      setCardDraft('')
      setAddingCardFor(null)
      onToast('Card added')
    } catch {
      onError('Couldn’t add card.')
    }
  }

  if (loading) {
    return (
      <div className="empty">
        <strong>Loading board…</strong>
      </div>
    )
  }

  return (
    <div className="kanban-shell">
      <p className="kanban-hint">
        Secondary board view — card order here is independent of Today/Master list order.
        Column roles (Backlog / Doing / Done) drive status; renaming a column no longer
        changes workflow. Dropping into Done marks the task complete for today.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={(e) => void onDragEnd(e)}
      >
        <SortableContext
          items={columns.map((c) => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="kanban-board">
            {columns.map((col) => (
              <SortableColumn
                key={col.id}
                column={col}
                tasks={tasksByColumn[col.id] || []}
                busy={busy}
                adding={addingCardFor === col.id}
                cardDraft={cardDraft}
                onOpenNotes={onOpenNotes}
                onStartAdd={() => {
                  setAddingCardFor(col.id)
                  setCardDraft('')
                }}
                onCancelAdd={() => setAddingCardFor(null)}
                onCardDraft={setCardDraft}
                onAddCard={() => void addCard(col.id)}
                onRename={(name) => void renameColumn(col.id, name)}
                onColor={(color) => void recolorColumn(col.id, color)}
                onRole={(role) => void setColumnRole(col.id, role)}
                onDelete={() => void removeColumn(col.id)}
              />
            ))}

            <div className="kanban-add-col">
              <TextInput
                placeholder="New column name"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addColumn()
                }}
              />
              <Button
                color="dark"
                disabled={!newColumnName.trim()}
                onClick={() => void addColumn()}
              >
                + Add column
              </Button>
            </div>
          </div>
        </SortableContext>

        <DragOverlay>
          {activeTask ? <KanbanCardFace task={activeTask} dragging /> : null}
          {activeColumn ? (
            <div className="kanban-col overlay-col" style={{ borderTopColor: activeColumn.color }}>
              <h3>{activeColumn.name}</h3>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function SortableColumn({
  column,
  tasks,
  busy,
  adding,
  cardDraft,
  onOpenNotes,
  onStartAdd,
  onCancelAdd,
  onCardDraft,
  onAddCard,
  onRename,
  onColor,
  onRole,
  onDelete,
}: {
  column: BoardColumn
  tasks: Task[]
  busy: boolean
  adding: boolean
  cardDraft: string
  onOpenNotes: (task: Task) => void
  onStartAdd: () => void
  onCancelAdd: () => void
  onCardDraft: (v: string) => void
  onAddCard: () => void
  onRename: (name: string) => void
  onColor: (color: string) => void
  onRole: (role: BoardColumn['role']) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: column.id,
      data: { type: 'column' },
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderTopColor: column.color,
  }

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(column.name)

  useEffect(() => setNameDraft(column.name), [column.name])

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="kanban-col"
      data-column-id={column.id}
    >
      <div className="kanban-col-header">
        <button
          type="button"
          className="kanban-drag-handle"
          aria-label={`Drag ${column.name} column`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        {editingName ? (
          <TextInput
            className="kanban-rename"
            value={nameDraft}
            autoFocus
            size="xs"
            onChange={(e) => setNameDraft(e.currentTarget.value)}
            onBlur={() => {
              setEditingName(false)
              if (nameDraft.trim() && nameDraft.trim() !== column.name) {
                onRename(nameDraft.trim())
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setNameDraft(column.name)
                setEditingName(false)
              }
            }}
          />
        ) : (
          <h3 onDoubleClick={() => setEditingName(true)} title="Double-click to rename">
            <span className="col-dot" style={{ background: column.color }} />
            {column.name}{' '}
            <span className="col-count">{tasks.length}</span>
            {column.role === 'done' || column.isTerminal ? (
              <span className="col-terminal">Done</span>
            ) : column.role === 'doing' ? (
              <span className="col-terminal doing">Doing</span>
            ) : null}
          </h3>
        )}
        <div className="kanban-col-actions">
          <Select
            aria-label="Column role"
            value={column.role || 'custom'}
            onChange={(v) => v && onRole(v as BoardColumn['role'])}
            title="Workflow role (not the display name)"
            data={[
              { value: 'backlog', label: 'Backlog' },
              { value: 'doing', label: 'Doing' },
              { value: 'done', label: 'Done' },
              { value: 'custom', label: 'Custom' },
            ]}
            w={100}
            size="xs"
          />
          <Select
            aria-label="Column color"
            value={column.color}
            onChange={(v) => v && onColor(v)}
            data={COLUMN_COLORS.map((c) => ({ value: c, label: c }))}
            w={110}
            size="xs"
            renderOption={({ option }) => (
              <Group gap={8}>
                <span
                  className="col-dot"
                  style={{ background: option.value, width: 10, height: 10 }}
                />
                {option.label}
              </Group>
            )}
          />
          <ActionIcon
            variant="subtle"
            onClick={() => setEditingName(true)}
            aria-label="Rename"
          >
            ✎
          </ActionIcon>
          <ActionIcon color="red" variant="subtle" onClick={onDelete} aria-label="Delete column">
            ×
          </ActionIcon>
        </div>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="kanban-col-body">
          {tasks.map((task) => (
            <SortableCard
              key={task.id}
              task={task}
              columnId={column.id}
              onOpenNotes={onOpenNotes}
            />
          ))}
          {tasks.length === 0 && <div className="kanban-empty">Drop cards here</div>}
        </div>
      </SortableContext>

      {adding ? (
        <div className="kanban-add-card">
          <TextInput
            placeholder="Card title"
            value={cardDraft}
            autoFocus
            disabled={busy}
            onChange={(e) => onCardDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAddCard()
              if (e.key === 'Escape') onCancelAdd()
            }}
          />
          <Group gap="sm" mt="xs">
            <Button variant="default" size="xs" onClick={onCancelAdd}>
              Cancel
            </Button>
            <Button
              color="dark"
              size="xs"
              disabled={!cardDraft.trim()}
              onClick={onAddCard}
            >
              Add
            </Button>
          </Group>
        </div>
      ) : (
        <Button variant="subtle" color="gray" className="kanban-add-btn" onClick={onStartAdd}>
          + Add card
        </Button>
      )}
    </div>
  )
}

function SortableCard({
  task,
  columnId,
  onOpenNotes,
}: {
  task: Task
  columnId: string
  onOpenNotes: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: 'task', columnId },
    })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardFace task={task} onOpenNotes={onOpenNotes} />
    </div>
  )
}

function KanbanCardFace({
  task,
  dragging,
  onOpenNotes,
}: {
  task: Task
  dragging?: boolean
  onOpenNotes?: (task: Task) => void
}) {
  const progress = task.subtaskProgress
  const hasNotes = Boolean(task.notes?.trim())
  return (
    <div className={`kanban-card ${dragging ? 'dragging' : ''}`}>
      <strong>{task.title}</strong>
      <div className="kanban-card-meta">
        <span className={`badge category ${task.category}`}>{task.category}</span>
        <span className={`badge priority ${task.priority as Priority}`}>{task.priority}</span>
        {progress.total > 0 && (
          <span className="badge project">
            {progress.done}/{progress.total}
          </span>
        )}
      </div>
      {task.subtasks?.slice(0, 3).map((s) => (
        <div key={s.id} className={`kanban-sub ${s.done ? 'done' : ''}`}>
          {s.done ? '✓' : '○'} {s.title}
        </div>
      ))}
      {(task.subtasks?.length || 0) > 3 && (
        <div className="task-notes">+{task.subtasks.length - 3} more</div>
      )}
      {onOpenNotes && !dragging && (
        <Button
          variant="subtle"
          size="compact-xs"
          color="gray"
          className="kanban-card-notes"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onOpenNotes(task)
          }}
        >
          {hasNotes ? notesCopy.kanbanHasNotes : notesCopy.kanbanAddNotes}
        </Button>
      )}
    </div>
  )
}
