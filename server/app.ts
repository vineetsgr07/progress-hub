import cors from 'cors'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { resolveCadenceFields } from './cadence.js'
import {
  buildProgressSeries,
  isProgressRange,
} from './day-progress.js'
import {
  applyListSort,
  assignUniqueRole,
  db,
  defaultListSort,
  getBacklogColumnId,
  getDoingColumnId,
  getSetting,
  getTerminalColumnId,
  migrate,
  parseColumnRole,
  parseListSort,
  setSetting,
  statusForColumn,
  type ColumnRole,
  type ListSort,
  type ListSortDir,
  type ListSortField,
} from './db.js'
import { reconcileSheetSubtasks, seedIfEmpty } from './seed.js'
import { requireAuth } from './auth.js'
import { mergeNoteOrder, noteItemKey } from './notes-list.js'
import {
  NOTES_LIST_ORDER_KEY,
  loadAnalyticsPage,
  loadHabits,
  loadHabitsProgress,
  loadNotes,
  loadStats,
  loadTaskRows,
  loadTodayPage,
  loadTodayPulse,
  loadWeek,
  mapHabit,
  readNotesListOrder,
} from './page-data.js'
import {
  EMPTY_MINDMAP_DOCUMENT,
  parseMindmapDocument,
  stringifyMindmapDocument,
} from './mindmap-document.js'

export async function createApp() {
  await migrate()
  if (process.env.TRACKER_SKIP_SEED !== '1') {
    await seedIfEmpty()
    await reconcileSheetSubtasks()
  }

  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '32mb' }))
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api') || req.path === '/api/health') {
      next()
      return
    }
    void requireAuth(req, res, next)
  })

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function ensureDayEntry(taskId: string, date: string) {
  const existing = await db
    .prepare('SELECT * FROM day_entries WHERE task_id = ? AND date = ?')
    .get(taskId, date)
  if (existing) return existing

  const now = new Date().toISOString()
  const id = randomUUID()
  await db.prepare(`
    INSERT INTO day_entries (id, task_id, date, completed, hours, timer_started_at, timer_subtask_id, notes, created_at, updated_at)
    VALUES (?, ?, ?, 0, 0, NULL, NULL, '', ?, ?)
  `).run(id, taskId, date, now, now)

  return await db.prepare('SELECT * FROM day_entries WHERE id = ?').get(id)
}

async function insertTimeLog(opts: {
  taskId: string
  date: string
  hours: number
  note: string
  createdAt: string
  subtaskId?: string | null
}) {
  await db.prepare(`
    INSERT INTO time_logs (id, task_id, date, hours, note, created_at, subtask_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    opts.taskId,
    opts.date,
    opts.hours,
    opts.note,
    opts.createdAt,
    opts.subtaskId ?? null,
  )
}

async function loadSubtaskHours(taskId: string, date: string): Map<string, number> {
  const map = new Map<string, number>()
  const rows = await db
    .prepare(
      `SELECT subtask_id, SUM(hours) AS hours
       FROM time_logs
       WHERE task_id = ? AND date = ? AND subtask_id IS NOT NULL
       GROUP BY subtask_id`,
    )
    .all(taskId, date) as Array<{ subtask_id: string; hours: number }>
  for (const r of rows) map.set(String(r.subtask_id), Number(r.hours))
  return map
}

async function resolveSubtaskIdForTask(
  taskId: string,
  subtaskId: unknown,
): { ok: true; subtaskId: string | null } | { ok: false; error: string } {
  if (subtaskId == null || subtaskId === '') {
    return { ok: true, subtaskId: null }
  }
  const id = String(subtaskId)
  const row = await db
    .prepare('SELECT id FROM subtasks WHERE id = ? AND task_id = ?')
    .get(id, taskId) as { id: string } | undefined
  if (!row) {
    return { ok: false, error: 'subtaskId must belong to this task' }
  }
  return { ok: true, subtaskId: id }
}

async function loadSubtasks(
  taskId: string,
  opts?: { date?: string; category?: string; hoursBySubtask?: Map<string, number> },
) {
  const category = opts?.category
  const date = opts?.date
  const useDayScope = category === 'Daily' && Boolean(date)
  const hoursBySubtask = opts?.hoursBySubtask

  if (useDayScope) {
    return (
      await db
        .prepare(
          `SELECT s.*, COALESCE(sds.done, 0) AS day_done
           FROM subtasks s
           LEFT JOIN subtask_day_state sds
             ON sds.subtask_id = s.id AND sds.date = ?
           WHERE s.task_id = ?
           ORDER BY s.position ASC, s.created_at ASC`,
        )
        .all(date, taskId) as Array<Record<string, unknown>>
    ).map((row) =>
      mapSubtask(row, {
        doneOverride: Number(row.day_done) === 1,
        hours: hoursBySubtask?.get(String(row.id)) ?? 0,
      }),
    )
  }

  return (
      await db
      .prepare(
        `SELECT * FROM subtasks WHERE task_id = ? ORDER BY position ASC, created_at ASC`,
      )
      .all(taskId) as Array<Record<string, unknown>>
  ).map((row) =>
    mapSubtask(row, {
      hours: hoursBySubtask?.get(String(row.id)) ?? 0,
    }),
  )
}

function mapSubtask(
  row: Record<string, unknown>,
  opts?: { doneOverride?: boolean; hours?: number },
) {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    title: row.title as string,
    done:
      opts?.doneOverride !== undefined
        ? opts.doneOverride
        : Number(row.done) === 1,
    position: Number(row.position),
    hours: opts?.hours ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function mapColumn(row: Record<string, unknown>) {
  const role = (row.role as ColumnRole) || 'custom'
  return {
    id: row.id as string,
    name: row.name as string,
    position: Number(row.position),
    color: row.color as string,
    role,
    isTerminal: Boolean(row.is_terminal) || role === 'done',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

async function mapTask(
  row: Record<string, unknown>,
  entry?: Record<string, unknown> | null,
  dateForSubtasks?: string | null,
) {
  const category = String(row.category)
  const date =
    dateForSubtasks ||
    (entry?.date ? String(entry.date) : null) ||
    (category === 'Daily' ? todayISO() : null)
  const hoursBySubtask = date
    ? await loadSubtaskHours(String(row.id), date)
    : new Map<string, number>()
  const subtasks = await loadSubtasks(String(row.id), {
    date: date || undefined,
    category,
    hoursBySubtask,
  })
  const doneCount = subtasks.filter((s) => s.done).length
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    category: row.category,
    projectTag: row.project_tag,
    priority: row.priority,
    status: row.status,
    columnId: row.column_id ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    boardSort: Number(row.board_sort ?? 0),
    isMaster: Number(row.is_master) === 1,
    cadenceWeekday:
      row.cadence_weekday == null ? null : Number(row.cadence_weekday),
    cadenceMonthDay:
      row.cadence_month_day == null ? null : Number(row.cadence_month_day),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subtasks,
    subtaskProgress: { done: doneCount, total: subtasks.length },
    entry: entry
      ? {
          id: entry.id,
          date: entry.date,
          completed: Number(entry.completed) === 1,
          hours: Number(entry.hours),
          timerStartedAt: entry.timer_started_at,
          timerSubtaskId:
            entry.timer_subtask_id == null
              ? null
              : String(entry.timer_subtask_id),
          notes: entry.notes,
        }
      : null,
  }
}

async function mapTasks(rows: Record<string, unknown>[], date: string) {
  if (rows.length === 0) return []
  const ids = rows.map((row) => String(row.id))
  const placeholders = ids.map(() => '?').join(',')
  const categoryById = new Map(rows.map((row) => [String(row.id), String(row.category)]))

  const entries = (await db
    .prepare(
      `SELECT * FROM day_entries WHERE date = ? AND task_id IN (${placeholders})`,
    )
    .all(date, ...ids)) as Record<string, unknown>[]
  const entryByTask = new Map(entries.map((entry) => [String(entry.task_id), entry]))

  const subRows = (await db
    .prepare(
      `SELECT s.*, COALESCE(sds.done, 0) AS day_done
       FROM subtasks s
       LEFT JOIN subtask_day_state sds
         ON sds.subtask_id = s.id AND sds.date = ?
       WHERE s.task_id IN (${placeholders})
       ORDER BY s.position ASC, s.created_at ASC`,
    )
    .all(date, ...ids)) as Record<string, unknown>[]

  const hourRows = (await db
    .prepare(
      `SELECT subtask_id, SUM(hours) AS hours
       FROM time_logs
       WHERE date = ? AND subtask_id IS NOT NULL AND task_id IN (${placeholders})
       GROUP BY subtask_id`,
    )
    .all(date, ...ids)) as Array<{ subtask_id: string; hours: number }>
  const hoursBySubtask = new Map(
    hourRows.map((row) => [String(row.subtask_id), Number(row.hours)]),
  )

  const subsByTask = new Map<string, ReturnType<typeof mapSubtask>[]>()
  for (const row of subRows) {
    const taskId = String(row.task_id)
    const useDayScope = categoryById.get(taskId) === 'Daily'
    const mapped = mapSubtask(row, {
      doneOverride: useDayScope ? Number(row.day_done) === 1 : undefined,
      hours: hoursBySubtask.get(String(row.id)) ?? 0,
    })
    const list = subsByTask.get(taskId)
    if (list) list.push(mapped)
    else subsByTask.set(taskId, [mapped])
  }

  return rows.map((row) => {
    const id = String(row.id)
    const subtasks = subsByTask.get(id) ?? []
    const entry = entryByTask.get(id)
    const doneCount = subtasks.filter((s) => s.done).length
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      category: row.category,
      projectTag: row.project_tag,
      priority: row.priority,
      status: row.status,
      columnId: row.column_id ?? null,
      sortOrder: Number(row.sort_order ?? 0),
      boardSort: Number(row.board_sort ?? 0),
      isMaster: Number(row.is_master) === 1,
      cadenceWeekday:
        row.cadence_weekday == null ? null : Number(row.cadence_weekday),
      cadenceMonthDay:
        row.cadence_month_day == null ? null : Number(row.cadence_month_day),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      subtasks,
      subtaskProgress: { done: doneCount, total: subtasks.length },
      entry: entry
        ? {
            id: entry.id,
            date: entry.date,
            completed: Number(entry.completed) === 1,
            hours: Number(entry.hours),
            timerStartedAt: entry.timer_started_at,
            timerSubtaskId:
              entry.timer_subtask_id == null
                ? null
                : String(entry.timer_subtask_id),
            notes: entry.notes,
          }
        : null,
    }
  })
}

async function stopRunningTimers(date: string, exceptTaskId?: string) {
  const now = new Date().toISOString()
  const running = await db
    .prepare('SELECT * FROM day_entries WHERE timer_started_at IS NOT NULL AND date = ?')
    .all(date) as Record<string, unknown>[]

  for (const r of running) {
    if (exceptTaskId && r.task_id === exceptTaskId) continue
    const started = new Date(String(r.timer_started_at)).getTime()
    const elapsedHrs = (Date.now() - started) / 3_600_000
    const subtaskId =
      r.timer_subtask_id == null ? null : String(r.timer_subtask_id)
    await db.prepare(`
      UPDATE day_entries
      SET hours = hours + ?, timer_started_at = NULL, timer_subtask_id = NULL, updated_at = ?
      WHERE id = ?
    `).run(elapsedHrs, now, r.id)
    await insertTimeLog({
      taskId: String(r.task_id),
      date,
      hours: elapsedHrs,
      note: 'auto-stop',
      createdAt: now,
      subtaskId,
    })
    const backlog = await getBacklogColumnId()
    await db.prepare(
      `UPDATE tasks SET status = 'todo', column_id = ?, updated_at = ? WHERE id = ? AND status = 'doing'`,
    ).run(backlog, now, r.task_id)
  }
}

/** Bank + clear a running timer when its checklist item is marked done. */
async function stopRunningTimerForSubtask(
  taskId: string,
  subtaskId: string,
  date: string,
) {
  const entry = await db
    .prepare('SELECT * FROM day_entries WHERE task_id = ? AND date = ?')
    .get(taskId, date) as Record<string, unknown> | undefined
  if (!entry?.timer_started_at) return
  if (entry.timer_subtask_id == null || String(entry.timer_subtask_id) !== subtaskId) {
    return
  }

  const now = new Date().toISOString()
  const started = new Date(String(entry.timer_started_at)).getTime()
  const elapsedHrs = Math.max(0, (Date.now() - started) / 3_600_000)
  await db.prepare(`
    UPDATE day_entries
    SET hours = hours + ?, timer_started_at = NULL, timer_subtask_id = NULL, updated_at = ?
    WHERE id = ?
  `).run(elapsedHrs, now, entry.id)
  await insertTimeLog({
    taskId,
    date,
    hours: elapsedHrs,
    note: 'timer',
    createdAt: now,
    subtaskId,
  })
  if (!Number(entry.completed)) {
    const backlog = await getBacklogColumnId()
    await db.prepare(
      `UPDATE tasks SET status = 'todo', column_id = ?, updated_at = ? WHERE id = ? AND status = 'doing'`,
    ).run(backlog, now, taskId)
  }
}

async function nextBoardSort(columnId: string) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(board_sort), -1) AS m FROM tasks WHERE column_id = ?`)
    .get(columnId) as { m: number }
  return row.m + 1
}

async function nextListSort() {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM tasks WHERE is_master = 1`)
    .get() as { m: number }
  return row.m + 1
}

/** List order (Today/Master): push task to the end of the master list. */
async function moveTaskToListEnd(taskId: string, now: string) {
  await db.prepare(`UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?`).run(
    await nextListSort(),
    now,
    taskId,
  )
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true })
})

async function readAppSettings() {
  const listSort = parseListSort(await getSetting('list_sort'))
  let tagColors: unknown = null
  const rawColors = await getSetting('tag_colors')
  if (rawColors) {
    try {
      tagColors = JSON.parse(rawColors)
    } catch {
      tagColors = null
    }
  }
  let tagLists: unknown = null
  const rawLists = await getSetting('tag_lists')
  if (rawLists) {
    try {
      tagLists = JSON.parse(rawLists)
    } catch {
      tagLists = null
    }
  }
  return { listSort, tagColors, tagLists }
}

app.get('/api/settings', async (_req, res) => {
  res.json(await readAppSettings())
})

app.patch('/api/settings', async (req, res) => {
  if (req.body?.tagColors != null) {
    await setSetting('tag_colors', JSON.stringify(req.body.tagColors))
  }
  if (req.body?.tagLists != null) {
    await setSetting('tag_lists', JSON.stringify(req.body.tagLists))
  }
  if (req.body?.listSort != null) {
    const parsed = parseListSort(JSON.stringify(req.body.listSort))
    await setSetting('list_sort', JSON.stringify(parsed))
  }
  res.json(await readAppSettings())
})

app.post('/api/tags/rename', async (req, res) => {
  const kind = String(req.body?.kind || '')
  const from = String(req.body?.from || '').trim()
  const to = String(req.body?.to || '').trim()
  if ((kind !== 'category' && kind !== 'project') || !from || !to) {
    res.status(400).json({ error: 'kind, from, and to are required' })
    return
  }
  if (from === to) {
    res.json({ ok: true, updated: 0 })
    return
  }
  // Protect cadence builtins from rename.
  const builtins = [
    'Daily',
    'Weekly',
    'Monthly',
    'Quarterly',
    'Goal',
    'Projects',
  ]
  if (kind === 'category' && builtins.includes(from)) {
    res.status(400).json({ error: 'Built-in frequency tags cannot be renamed' })
    return
  }

  const now = new Date().toISOString()
  const column = kind === 'category' ? 'category' : 'project_tag'
  const result = await db
    .prepare(
      `UPDATE tasks SET ${column} = ?, updated_at = ? WHERE ${column} = ?`,
    )
    .run(to, now, from)

  // Keep colour map keys in sync when present.
  const rawColors = await getSetting('tag_colors')
  if (rawColors) {
    try {
      const colors = JSON.parse(rawColors) as Record<string, Record<string, string>>
      const bucket = colors[kind] || {}
      if (from in bucket) {
        bucket[to] = bucket[from]
        delete bucket[from]
        colors[kind] = bucket
        await setSetting('tag_colors', JSON.stringify(colors))
      }
    } catch {
      /* ignore */
    }
  }

  const rawLists = await getSetting('tag_lists')
  if (rawLists) {
    try {
      const lists = JSON.parse(rawLists) as {
        category?: string[]
        project?: string[]
      }
      const key = kind === 'category' ? 'category' : 'project'
      if (Array.isArray(lists[key])) {
        lists[key] = lists[key]!.map((v) => (v === from ? to : v))
        await setSetting('tag_lists', JSON.stringify(lists))
      }
    } catch {
      /* ignore */
    }
  }

  res.json({ ok: true, updated: result.changes, ...readAppSettings() })
})

/** Sort all master tasks by category / project / priority and save order in DB. */
app.patch('/api/tasks/sort', async (req, res) => {
  const field = String(req.body?.field || 'manual') as ListSortField
  const dir = (req.body?.dir === 'desc' ? 'desc' : 'asc') as ListSortDir
  const allowed: ListSortField[] = ['manual', 'category', 'project', 'priority']
  if (!allowed.includes(field)) {
    res.status(400).json({ error: 'Invalid sort field' })
    return
  }
  const sort: ListSort = field === 'manual' ? defaultListSort() : { field, dir }
  const orderedIds = await applyListSort(sort)
  res.json({ ok: true, orderedIds, listSort: sort })
})

app.get('/api/tasks', async (req, res) => {
  const date = String(req.query.date || todayISO())
  const category = req.query.category ? String(req.query.category) : null
  const masterOnly = req.query.master === '1'
  const rows = await loadTaskRows(date, { category, master: masterOnly })
  const tasks = await mapTasks(rows, date)
  res.json({ date, tasks })
})

app.get('/api/today', async (req, res) => {
  const date = String(req.query.date || todayISO())
  const category = req.query.category ? String(req.query.category) : null
  const master = req.query.master === '1'
  res.json(
    await loadTodayPage({ date, category, master }, (rows, day) =>
      mapTasks(rows, day),
    ),
  )
})

app.get('/api/today/pulse', async (req, res) => {
  const date = String(req.query.date || todayISO())
  res.json(await loadTodayPulse(date))
})

app.get('/api/analytics', async (req, res) => {
  const date = String(req.query.date || todayISO())
  res.json(await loadAnalyticsPage(date))
})

app.post('/api/tasks', async (req, res) => {
  const {
    title,
    notes = '',
    category = 'Daily',
    projectTag = 'Work',
    priority = 'Medium',
    addToToday = true,
    date = todayISO(),
    columnId,
    status: statusInput,
    subtasks = [],
    cadenceWeekday,
    cadenceMonthDay,
  } = req.body ?? {}

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'Task title is required' })
    return
  }

  const cadence = resolveCadenceFields(
    String(category),
    cadenceWeekday ?? null,
    cadenceMonthDay ?? null,
  )
  if (cadence.error) {
    res.status(400).json({ error: cadence.error })
    return
  }

  const now = new Date().toISOString()
  const id = randomUUID()
  let col = columnId || await getBacklogColumnId()
  if (!columnId && (statusInput === 'todo' || statusInput === 'doing' || statusInput === 'done')) {
    if (statusInput === 'doing') col = await getDoingColumnId()
    else if (statusInput === 'done') col = await getTerminalColumnId() || await getBacklogColumnId()
    else col = await getBacklogColumnId()
  }
  const boardSort = await nextBoardSort(col)
  const sortOrder = await nextListSort()
  const status = await statusForColumn(col)

  await db.prepare(`
    INSERT INTO tasks (
      id, title, notes, category, project_tag, priority, status, is_master,
      column_id, sort_order, board_sort, cadence_weekday, cadence_month_day,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title.trim(),
    notes,
    category,
    projectTag,
    priority,
    status,
    col,
    sortOrder,
    boardSort,
    cadence.cadenceWeekday,
    cadence.cadenceMonthDay,
    now,
    now,
  )

  if (Array.isArray(subtasks)) {
    for (const [index, s] of subtasks.entries()) {
      const st = typeof s === 'string' ? s.trim() : String(s?.title || '').trim()
      if (!st) continue
      await db.prepare(`
        INSERT INTO subtasks (id, task_id, title, done, position, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
      `).run(randomUUID(), id, st, index, now, now)
    }
  }

  let entry = null
  if (addToToday) {
    entry = await ensureDayEntry(id, date) as Record<string, unknown>
  }

  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json(await mapTask(row, entry))
})

app.patch('/api/tasks/reorder', async (req, res) => {
  const orderedIds = req.body.orderedIds as string[]
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds required' })
    return
  }
  const now = new Date().toISOString()
  const update = await db.prepare(
    `UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?`,
  )
  const tx = db.transaction(async () => {
    for (const [index, id] of orderedIds.entries()) {
      await update.run(index, now, id)
    }
    // Manual drag clears column-sort preference
    await setSetting('list_sort', JSON.stringify(defaultListSort()))
  })
  await tx()
  res.json({ ok: true, count: orderedIds.length, listSort: defaultListSort() })
})

app.patch('/api/tasks/:id', async (req, res) => {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  const date = String(req.body.date || todayISO())
  const now = new Date().toISOString()

  let columnId = (req.body.columnId ?? task.column_id) as string | null
  let status = (req.body.status ?? task.status) as string

  if (req.body.status && !req.body.columnId) {
    if (req.body.status === 'doing') columnId = await getDoingColumnId()
    else if (req.body.status === 'done') columnId = await getTerminalColumnId() || await getBacklogColumnId()
    else columnId = await getBacklogColumnId()
    status = req.body.status
  }

  if (req.body.columnId) {
    status = await statusForColumn(String(req.body.columnId))
    columnId = String(req.body.columnId)
  }

  // Kanban-style status helpers for day entries
  if (status === 'doing') {
    await stopRunningTimers(date, req.params.id)
    const entry = await ensureDayEntry(req.params.id, date) as Record<string, unknown>
    if (!entry.timer_started_at) {
      await db.prepare(
        `UPDATE day_entries SET timer_started_at = ?, timer_subtask_id = NULL, updated_at = ? WHERE id = ?`,
      ).run(now, now, entry.id)
    }
  } else if (status === 'done') {
    await stopRunningTimers(date)
    const entry = await ensureDayEntry(req.params.id, date) as Record<string, unknown>
    await db.prepare(
      `UPDATE day_entries SET completed = 1, timer_started_at = NULL, timer_subtask_id = NULL, updated_at = ? WHERE id = ?`,
    ).run(now, entry.id)
  } else if (req.body.status === 'todo' || (req.body.columnId && status === 'todo')) {
    const entry = await db
      .prepare('SELECT * FROM day_entries WHERE task_id = ? AND date = ?')
      .get(req.params.id, date) as Record<string, unknown> | undefined
    if (entry?.timer_started_at) {
      const started = new Date(String(entry.timer_started_at)).getTime()
      const elapsedHrs = (Date.now() - started) / 3_600_000
      const subtaskId =
        entry.timer_subtask_id == null ? null : String(entry.timer_subtask_id)
      await db.prepare(`
        UPDATE day_entries
        SET hours = hours + ?, timer_started_at = NULL, timer_subtask_id = NULL, completed = 0, updated_at = ?
        WHERE id = ?
      `).run(elapsedHrs, now, entry.id)
      await insertTimeLog({
        taskId: String(req.params.id),
        date,
        hours: elapsedHrs,
        note: 'status-todo',
        createdAt: now,
        subtaskId,
      })
    } else if (entry && req.body.status === 'todo') {
      await db.prepare(`UPDATE day_entries SET completed = 0, updated_at = ? WHERE id = ?`).run(
        now,
        entry.id,
      )
    }
  }

  const nextCategory = String(req.body.category ?? task.category)
  const weekdayInput =
    req.body.cadenceWeekday !== undefined
      ? req.body.cadenceWeekday
      : nextCategory === String(task.category)
        ? task.cadence_weekday
        : null
  const monthDayInput =
    req.body.cadenceMonthDay !== undefined
      ? req.body.cadenceMonthDay
      : nextCategory === String(task.category)
        ? task.cadence_month_day
        : null
  const cadence = resolveCadenceFields(nextCategory, weekdayInput, monthDayInput)
  if (cadence.error) {
    res.status(400).json({ error: cadence.error })
    return
  }

  await db.prepare(`
    UPDATE tasks
    SET title = ?, notes = ?, category = ?, project_tag = ?, priority = ?,
        status = ?, column_id = ?, cadence_weekday = ?, cadence_month_day = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    req.body.title ?? task.title,
    req.body.notes ?? task.notes,
    nextCategory,
    req.body.projectTag ?? task.project_tag,
    req.body.priority ?? task.priority,
    status,
    columnId,
    cadence.cadenceWeekday,
    cadence.cadenceMonthDay,
    now,
    req.params.id,
  )

  const entry = await db
    .prepare('SELECT * FROM day_entries WHERE task_id = ? AND date = ?')
    .get(req.params.id, date) as Record<string, unknown> | undefined
  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Record<
    string,
    unknown
  >
  res.json(await mapTask(row, entry))
})

app.delete('/api/tasks/:id', async (req, res) => {
  const info = await db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id)
  if (info.changes === 0) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  res.status(204).end()
})

app.post('/api/tasks/:id/schedule', async (req, res) => {
  const date = String(req.body.date || todayISO())
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const entry = await ensureDayEntry(req.params.id, date) as Record<string, unknown>
  res.json(await mapTask(task as Record<string, unknown>, entry))
})

// ---- Subtasks ----

app.patch('/api/tasks/:id/subtasks/reorder', async (req, res) => {
  const task = await db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const orderedIds = req.body.orderedIds as string[]
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds required' })
    return
  }
  const now = new Date().toISOString()
  const update = await db.prepare(
    `UPDATE subtasks SET position = ?, updated_at = ? WHERE id = ? AND task_id = ?`,
  )
  const tx = db.transaction(async () => {
    for (const [index, id] of orderedIds.entries()) {
      await update.run(index, now, id, req.params.id)
    }
  })
  await tx()
  await db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, req.params.id)
  res.json({ ok: true, count: orderedIds.length })
})

app.post('/api/tasks/:id/subtasks', async (req, res) => {
  const task = await db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  // Empty title allowed so Enter can create the next checklist row for typing.
  const title = String(req.body.title ?? '').trim()
  const now = new Date().toISOString()
  const max = await db
    .prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM subtasks WHERE task_id = ?`)
    .get(req.params.id) as { m: number }
  const id = randomUUID()
  await db.prepare(`
    INSERT INTO subtasks (id, task_id, title, done, position, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `).run(id, req.params.id, title, max.m + 1, now, now)
  await db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, req.params.id)
  res.status(201).json(mapSubtask(
    await db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as Record<string, unknown>,
  ))
})

app.patch('/api/subtasks/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Checklist item not found' })
    return
  }
  const parent = await db
    .prepare('SELECT category FROM tasks WHERE id = ?')
    .get(row.task_id) as { category: string } | undefined
  const now = new Date().toISOString()
  const title = req.body.title !== undefined ? String(req.body.title).trim() : row.title
  const position =
    typeof req.body.position === 'number' ? req.body.position : Number(row.position)
  const isDaily = parent?.category === 'Daily'
  const date =
    req.body.date !== undefined && req.body.date !== null && String(req.body.date).trim()
      ? String(req.body.date).trim()
      : typeof req.body.done === 'boolean' && isDaily
        ? todayISO()
        : null
  const useDayScope = isDaily && Boolean(date) && typeof req.body.done === 'boolean'

  if (useDayScope) {
    const done = req.body.done ? 1 : 0
    if (done) await stopRunningTimerForSubtask(String(row.task_id), String(req.params.id), date!)
    await db.prepare(`
      UPDATE subtasks SET title = ?, position = ?, updated_at = ? WHERE id = ?
    `).run(title, position, now, req.params.id)
    await db.prepare(`
      INSERT INTO subtask_day_state (subtask_id, date, done, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(subtask_id, date) DO UPDATE SET
        done = excluded.done,
        updated_at = excluded.updated_at
    `).run(req.params.id, date, done, now)
    await db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, row.task_id)

    const updated = await db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >
    res.json(mapSubtask(updated, { doneOverride: Boolean(done) }))
    return
  }

  const done =
    typeof req.body.done === 'boolean' ? (req.body.done ? 1 : 0) : Number(row.done)

  if (typeof req.body.done === 'boolean' && done) {
    await stopRunningTimerForSubtask(
      String(row.task_id),
      String(req.params.id),
      date || todayISO(),
    )
  }

  await db.prepare(`
    UPDATE subtasks SET title = ?, done = ?, position = ?, updated_at = ? WHERE id = ?
  `).run(title, done, position, now, req.params.id)
  await db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(now, row.task_id)

  const updated = await db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id) as Record<
    string,
    unknown
  >
  // Daily without date: still return day-scoped view for today when possible
  if (isDaily) {
    const viewDate = date || todayISO()
    const day = await db
      .prepare(
        `SELECT done FROM subtask_day_state WHERE subtask_id = ? AND date = ?`,
      )
      .get(req.params.id, viewDate) as { done: number } | undefined
    res.json(
      mapSubtask(updated, {
        doneOverride: day ? Boolean(day.done) : false,
      }),
    )
    return
  }

  res.json(mapSubtask(updated))
})

app.delete('/api/subtasks/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.id) as
    | { task_id: string }
    | undefined
  if (!row) {
    res.status(404).json({ error: 'Checklist item not found' })
    return
  }
  await db.prepare('DELETE FROM subtasks WHERE id = ?').run(req.params.id)
  await db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    row.task_id,
  )
  res.status(204).end()
})

// ---- Board columns ----

app.get('/api/board', async (_req, res) => {
  const columns = (
    await db
      .prepare(`SELECT * FROM board_columns ORDER BY position ASC`)
      .all() as Record<string, unknown>[]
  ).map(mapColumn)

  const taskRows = await db
    .prepare(
      `SELECT * FROM tasks WHERE is_master = 1 ORDER BY board_sort ASC, created_at ASC`,
    )
    .all() as Record<string, unknown>[]
  const tasks = []
  for (const t of taskRows) {
    tasks.push(await mapTask(t))
  }

  res.json({ columns, tasks })
})

app.post('/api/board/columns', async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name) {
    res.status(400).json({ error: 'Column name is required' })
    return
  }
  const now = new Date().toISOString()
  const max = await db
    .prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM board_columns`)
    .get() as { m: number }
  const id = randomUUID()
  let role = parseColumnRole(req.body.role) || 'custom'
  if (req.body.isTerminal === true) role = 'done'

  await db.prepare(`
    INSERT INTO board_columns (id, name, position, color, is_terminal, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    typeof req.body.position === 'number' ? req.body.position : max.m + 1,
    req.body.color || '#2b63e3',
    role === 'done' ? 1 : 0,
    role,
    now,
    now,
  )
  if (role !== 'custom') {
    await assignUniqueRole(id, role, now)
  }
  res.status(201).json(mapColumn(
    await db.prepare('SELECT * FROM board_columns WHERE id = ?').get(id) as Record<string, unknown>,
  ))
})

app.patch('/api/board/columns/reorder', async (req, res) => {
  const orderedIds = req.body.orderedIds as string[]
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: 'orderedIds required' })
    return
  }
  const now = new Date().toISOString()
  const update = await db.prepare(
    `UPDATE board_columns SET position = ?, updated_at = ? WHERE id = ?`,
  )
  const tx = db.transaction(async () => {
    for (const [index, id] of orderedIds.entries()) {
      await update.run(index, now, id)
    }
  })
  await tx()
  res.json({
    columns: (
      await db.prepare(`SELECT * FROM board_columns ORDER BY position ASC`).all() as Record<
        string,
        unknown
      >[]
    ).map(mapColumn),
  })
})

app.patch('/api/board/columns/:id', async (req, res) => {
  const col = await db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined
  if (!col) {
    res.status(404).json({ error: 'Column not found' })
    return
  }
  const now = new Date().toISOString()
  const name =
    req.body.name !== undefined ? String(req.body.name).trim() || col.name : col.name
  const color = req.body.color ?? col.color
  const position =
    typeof req.body.position === 'number' ? req.body.position : col.position

  let role = (col.role as ColumnRole) || 'custom'
  if (req.body.role !== undefined) {
    const parsed = parseColumnRole(req.body.role)
    if (!parsed) {
      res.status(400).json({ error: 'Invalid role' })
      return
    }
    role = parsed
  } else if (req.body.isTerminal === true) {
    role = 'done'
  } else if (req.body.isTerminal === false && role === 'done') {
    role = 'custom'
  }

  await db.prepare(`
    UPDATE board_columns
    SET name = ?, color = ?, position = ?, updated_at = ?
    WHERE id = ?
  `).run(name, color, position, now, req.params.id)

  await assignUniqueRole(String(req.params.id), role, now)

  // Keep task.status in sync with this column's role for cards already here
  const status = await statusForColumn(String(req.params.id))
  await db.prepare(`UPDATE tasks SET status = ?, updated_at = ? WHERE column_id = ?`).run(
    status,
    now,
    req.params.id,
  )

  res.json(mapColumn(
    await db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >,
  ))
})

app.delete('/api/board/columns/:id', async (req, res) => {
  const col = await db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id)
  if (!col) {
    res.status(404).json({ error: 'Column not found' })
    return
  }
  const count = await db.prepare('SELECT COUNT(*) AS c FROM board_columns').get() as { c: number }
  if (count.c <= 1) {
    res.status(400).json({ error: 'Keep at least one column' })
    return
  }
  const backlog = await getBacklogColumnId()
  const target = backlog === req.params.id
    ? (
        (await db
          .prepare(
            `SELECT id FROM board_columns WHERE id != ? ORDER BY position ASC LIMIT 1`,
          )
          .get(req.params.id)) as { id: string }
      ).id
    : backlog

  const now = new Date().toISOString()
  const tx = db.transaction(async () => {
    const status = await statusForColumn(target)
    await db.prepare(
      `UPDATE tasks SET column_id = ?, status = ?, updated_at = ? WHERE column_id = ?`,
    ).run(target, status, now, req.params.id)
    await db.prepare(`DELETE FROM board_columns WHERE id = ?`).run(req.params.id)
  })
  await tx()
  res.status(204).end()
})

app.patch('/api/board/move', async (req, res) => {
  const { taskId, columnId, sortOrder, orderedTaskIds } = req.body ?? {}
  if (!taskId || !columnId) {
    res.status(400).json({ error: 'taskId and columnId are required' })
    return
  }
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
  const col = await db.prepare('SELECT * FROM board_columns WHERE id = ?').get(columnId) as
    | Record<string, unknown>
    | undefined
  if (!task || !col) {
    res.status(404).json({ error: 'Task or column not found' })
    return
  }

  const now = new Date().toISOString()
  const date = String(req.body.date || todayISO())
  const status = await statusForColumn(columnId)

  const tx = db.transaction(async () => {
    await db.prepare(
      `UPDATE tasks SET column_id = ?, status = ?, board_sort = ?, updated_at = ? WHERE id = ?`,
    ).run(
      columnId,
      status,
      typeof sortOrder === 'number' ? sortOrder : await nextBoardSort(columnId),
      now,
      taskId,
    )

    if (Array.isArray(orderedTaskIds)) {
      const upd = await db.prepare(
        `UPDATE tasks SET board_sort = ?, column_id = ?, updated_at = ? WHERE id = ?`,
      )
      for (const [index, id] of (orderedTaskIds as string[]).entries()) {
        await upd.run(index, columnId, now, id)
      }
    }

    if (status === 'done') {
      const entry = await ensureDayEntry(taskId, date) as Record<string, unknown>
      await db.prepare(
        `UPDATE day_entries SET completed = 1, timer_started_at = NULL, timer_subtask_id = NULL, updated_at = ? WHERE id = ?`,
      ).run(now, entry.id)
    } else if (status === 'doing') {
      await stopRunningTimers(date, taskId)
      const entry = await ensureDayEntry(taskId, date) as Record<string, unknown>
      if (!entry.timer_started_at) {
        await db.prepare(
          `UPDATE day_entries SET timer_started_at = ?, timer_subtask_id = NULL, updated_at = ? WHERE id = ?`,
        ).run(now, now, entry.id)
      }
    }
  })
  await tx()

  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<
    string,
    unknown
  >
  res.json(await mapTask(row))
})

app.patch('/api/day-entries/:taskId', async (req, res) => {
  const date = String(req.body.date || todayISO())
  const entry = await ensureDayEntry(req.params.taskId, date) as Record<string, unknown>
  const now = new Date().toISOString()

  let hours = Number(entry.hours)
  let timerStartedAt = entry.timer_started_at as string | null
  let timerSubtaskId =
    entry.timer_subtask_id == null ? null : String(entry.timer_subtask_id)
  let completed = Number(entry.completed)

  if (typeof req.body.completed === 'boolean') {
    completed = req.body.completed ? 1 : 0
  }

  if (typeof req.body.hours === 'number' && !Number.isNaN(req.body.hours)) {
    hours = Math.max(0, req.body.hours)
  }

  if (req.body.timerAction === 'start') {
    const focus = await resolveSubtaskIdForTask(req.params.taskId, req.body.subtaskId)
    if (!focus.ok) {
      res.status(400).json({ error: focus.error })
      return
    }
    await stopRunningTimers(date, req.params.taskId)
    // Same-task focus switch: settle the prior session before restarting.
    if (timerStartedAt) {
      const started = new Date(timerStartedAt).getTime()
      const elapsedHrs = Math.max(0, (Date.now() - started) / 3_600_000)
      hours += elapsedHrs
      await insertTimeLog({
        taskId: req.params.taskId,
        date,
        hours: elapsedHrs,
        note: 'timer',
        createdAt: now,
        subtaskId: timerSubtaskId,
      })
    }
    timerStartedAt = now
    timerSubtaskId = focus.subtaskId
    const doing = await getDoingColumnId()
    await db.prepare(
      `UPDATE tasks SET status = 'doing', column_id = ?, updated_at = ? WHERE id = ?`,
    ).run(doing, now, req.params.taskId)
  }

  if (req.body.timerAction === 'stop' && timerStartedAt) {
    const started = new Date(timerStartedAt).getTime()
    const elapsedHrs = (Date.now() - started) / 3_600_000
    hours += elapsedHrs
    await insertTimeLog({
      taskId: req.params.taskId,
      date,
      hours: elapsedHrs,
      note: 'timer',
      createdAt: now,
      subtaskId: timerSubtaskId,
    })
    timerStartedAt = null
    timerSubtaskId = null
    if (!completed) {
      const backlog = await getBacklogColumnId()
      await db.prepare(
        `UPDATE tasks SET status = 'todo', column_id = ?, updated_at = ? WHERE id = ?`,
      ).run(backlog, now, req.params.taskId)
    }
  }

  await db.prepare(`
    UPDATE day_entries
    SET completed = ?, hours = ?, timer_started_at = ?, timer_subtask_id = ?, updated_at = ?
    WHERE id = ?
  `).run(completed, hours, timerStartedAt, timerSubtaskId, now, entry.id)

  if (typeof req.body.completed === 'boolean') {
    if (completed) {
      // Re-read in case timer was still running before the update above settled it
      const fresh = await db
        .prepare('SELECT * FROM day_entries WHERE id = ?')
        .get(entry.id) as Record<string, unknown>
      if (fresh.timer_started_at) {
        const started = new Date(String(fresh.timer_started_at)).getTime()
        const elapsedHrs = (Date.now() - started) / 3_600_000
        hours = Number(fresh.hours) + elapsedHrs
        const sid =
          fresh.timer_subtask_id == null ? null : String(fresh.timer_subtask_id)
        await insertTimeLog({
          taskId: req.params.taskId,
          date,
          hours: elapsedHrs,
          note: 'complete',
          createdAt: now,
          subtaskId: sid,
        })
        await db.prepare(
          `UPDATE day_entries SET hours = ?, timer_started_at = NULL, timer_subtask_id = NULL WHERE id = ?`,
        ).run(hours, entry.id)
        timerStartedAt = null
        timerSubtaskId = null
      }
      const terminal = await getTerminalColumnId() || await getBacklogColumnId()
      await db.prepare(
        `UPDATE tasks SET status = 'done', column_id = ?, updated_at = ? WHERE id = ?`,
      ).run(terminal, now, req.params.taskId)
      if (!Number(entry.completed)) {
        await moveTaskToListEnd(req.params.taskId, now)
      }
    } else {
      const backlog = await getBacklogColumnId()
      await db.prepare(
        `UPDATE tasks SET status = 'todo', column_id = ?, updated_at = ? WHERE id = ?`,
      ).run(backlog, now, req.params.taskId)
    }
  }

  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.taskId) as Record<
    string,
    unknown
  >
  const updated = await db.prepare('SELECT * FROM day_entries WHERE id = ?').get(entry.id) as Record<
    string,
    unknown
  >
  res.json(await mapTask(task, updated))
})

app.get('/api/goal', async (req, res) => {
  const date = String(req.query.date || todayISO())
  const row = await db.prepare('SELECT * FROM daily_goals WHERE date = ?').get(date) as
    | { goal: string }
    | undefined
  res.json({ date, goal: row?.goal ?? '' })
})

app.put('/api/goal', async (req, res) => {
  const date = String(req.body.date || todayISO())
  const goal = String(req.body.goal ?? '')
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO daily_goals (date, goal, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(date) DO UPDATE SET goal = excluded.goal, updated_at = excluded.updated_at
  `).run(date, goal, now)
  res.json({ date, goal })
})

app.get('/api/stats', async (req, res) => {
  const date = String(req.query.date || todayISO())
  res.json(await loadStats(date, { insight: req.query.insight === '1' }))
})

app.get('/api/stats/progress', async (req, res) => {
  const date = String(req.query.date || todayISO())
  const rangeRaw = String(req.query.range || 'week')
  if (!isProgressRange(rangeRaw)) {
    res.status(400).json({
      error: 'range must be day, week, or month',
    })
    return
  }
  res.json({
    date,
    range: rangeRaw,
    series: await buildProgressSeries(date, rangeRaw),
  })
})

app.get('/api/stats/week', async (req, res) => {
  const date = String(req.query.date || todayISO())
  res.json(await loadWeek(date))
})

app.get('/api/history', async (req, res) => {
  const limit = Number(req.query.limit || 50)
  const rows = await db
    .prepare(
      `SELECT tl.*, t.title, t.category, t.project_tag, t.priority,
              s.title AS subtask_title
       FROM time_logs tl
       JOIN tasks t ON t.id = tl.task_id
       LEFT JOIN subtasks s ON s.id = tl.subtask_id
       ORDER BY tl.created_at DESC
       LIMIT ?`,
    )
    .all(limit)

  res.json({
    logs: rows.map((r) => mapTimeLogRow(r as Record<string, unknown>)),
  })
})

/** Correct hours on a logged session; keep day_entries totals in sync. */
app.patch('/api/history/:id', async (req, res) => {
  const id = String(req.params.id)
  const existing = await db
    .prepare('SELECT * FROM time_logs WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ error: 'Time log not found' })
    return
  }

  const rawHours = req.body?.hours
  if (typeof rawHours !== 'number' || !Number.isFinite(rawHours)) {
    res.status(400).json({ error: 'hours must be a number' })
    return
  }
  const nextHours = Math.max(0, Math.round(rawHours * 100) / 100)
  const prevHours = Number(existing.hours)
  const delta = nextHours - prevHours
  const taskId = String(existing.task_id)
  const date = String(existing.date)
  const now = new Date().toISOString()

  await db.prepare('UPDATE time_logs SET hours = ? WHERE id = ?').run(nextHours, id)

  if (delta !== 0) {
    await ensureDayEntry(taskId, date)
    await db.prepare(
      `UPDATE day_entries
       SET hours = GREATEST(0, hours + ?), updated_at = ?
       WHERE task_id = ? AND date = ?`,
    ).run(delta, now, taskId, date)
  }

  const row = await db
    .prepare(
      `SELECT tl.*, t.title, t.category, t.project_tag, t.priority,
              s.title AS subtask_title
       FROM time_logs tl
       JOIN tasks t ON t.id = tl.task_id
       LEFT JOIN subtasks s ON s.id = tl.subtask_id
       WHERE tl.id = ?`,
    )
    .get(id) as Record<string, unknown>

  res.json(mapTimeLogRow(row))
})

function mapTimeLogRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    category: row.category,
    projectTag: row.project_tag,
    priority: row.priority,
    date: row.date,
    hours: Number(row.hours),
    note: row.note,
    createdAt: row.created_at,
    subtaskId: row.subtask_id == null ? null : String(row.subtask_id),
    subtaskTitle:
      row.subtask_title == null ? null : String(row.subtask_title),
  }
}

app.get('/api/dates', async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT date,
              COUNT(*) AS total,
              SUM(completed) AS completed,
              ROUND((SUM(hours))::numeric, 2)::float AS hours
       FROM day_entries
       GROUP BY date
       ORDER BY date DESC`,
    )
    .all()
  res.json({ dates: rows })
})

function mapStandaloneNote(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    source: 'note' as const,
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    projectTag: String(row.project_tag ?? 'Personal'),
    priority: String(row.priority ?? 'Medium'),
    pinned: Boolean(row.pinned),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

async function writeNotesListOrder(order: string[]) {
  await setSetting(NOTES_LIST_ORDER_KEY, JSON.stringify(order))
}

async function appendNotesListOrderKey(key: string) {
  const order = await readNotesListOrder()
  if (order.includes(key)) return
  await writeNotesListOrder([...order, key])
}

async function removeNotesListOrderKey(key: string) {
  const order = await readNotesListOrder()
  const next = order.filter((k) => k !== key)
  if (next.length !== order.length) await writeNotesListOrder(next)
}

app.get('/api/notes', async (req, res) => {
  res.json(
    await loadNotes({
      q: String(req.query.q || ''),
      project: String(req.query.project || ''),
      priority: String(req.query.priority || ''),
      source: String(req.query.source || ''),
      sort: String(req.query.sort || ''),
      scope: String(req.query.scope || ''),
    }),
  )
})

app.get('/api/notes/:source/:id', async (req, res) => {
  const source = String(req.params.source)
  const id = String(req.params.id)
  if (source !== 'task' && source !== 'note') {
    res.status(400).json({ error: 'source must be task or note' })
    return
  }

  if (source === 'task') {
    const row = await db
      .prepare(
        `SELECT id, title, notes, project_tag, priority, created_at, updated_at
         FROM tasks WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined
    if (!row) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.json({
      id: String(row.id),
      source: 'task',
      title: String(row.title ?? ''),
      body: String(row.notes ?? ''),
      projectTag: String(row.project_tag ?? ''),
      priority: String(row.priority ?? 'Medium'),
      pinned: false,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })
    return
  }

  const row = await db
    .prepare(`SELECT * FROM standalone_notes WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: 'Note not found' })
    return
  }
  res.json(mapStandaloneNote(row))
})

app.post('/api/notes', async (req, res) => {
  const body = req.body ?? {}
  const now = new Date().toISOString()
  const id = randomUUID()
  const title = String(body.title ?? '').trim()
  const noteBody = String(body.body ?? '')
  const projectTag = String(body.projectTag ?? 'Personal').trim() || 'Personal'
  const priority = String(body.priority ?? 'Medium')
  const pinned = body.pinned ? 1 : 0

  await db.prepare(
    `INSERT INTO standalone_notes
      (id, title, body, project_tag, priority, pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, title, noteBody, projectTag, priority, pinned, now, now)

  await appendNotesListOrderKey(noteItemKey({ source: 'note', id }))

  const row = await db
    .prepare(`SELECT * FROM standalone_notes WHERE id = ?`)
    .get(id) as Record<string, unknown>
  res.status(201).json(mapStandaloneNote(row))
})

app.patch('/api/notes/reorder', async (req, res) => {
  const orderedKeys = req.body?.orderedKeys as string[] | undefined
  if (!Array.isArray(orderedKeys) || orderedKeys.length === 0) {
    res.status(400).json({ error: 'orderedKeys required' })
    return
  }
  const cleaned = orderedKeys
    .filter((k): k is string => typeof k === 'string')
    .map((k) => k.trim())
    .filter((k) => /^(note|task):.+/.test(k))
  if (cleaned.length === 0) {
    res.status(400).json({ error: 'orderedKeys required' })
    return
  }
  const next = mergeNoteOrder(await readNotesListOrder(), cleaned)
  await writeNotesListOrder(next)
  res.json({ ok: true, count: cleaned.length, orderedKeys: next })
})

app.patch('/api/notes/:id', async (req, res) => {
  const id = String(req.params.id)
  const existing = await db
    .prepare(`SELECT * FROM standalone_notes WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ error: 'Note not found' })
    return
  }

  const body = req.body ?? {}
  const now = new Date().toISOString()
  const title =
    body.title !== undefined ? String(body.title).trim() : String(existing.title)
  const noteBody =
    body.body !== undefined ? String(body.body) : String(existing.body)
  const projectTag =
    body.projectTag !== undefined
      ? String(body.projectTag).trim() || 'Personal'
      : String(existing.project_tag)
  const priority =
    body.priority !== undefined
      ? String(body.priority)
      : String(existing.priority)
  const pinned =
    body.pinned !== undefined
      ? body.pinned
        ? 1
        : 0
      : Number(existing.pinned)

  await db.prepare(
    `UPDATE standalone_notes
     SET title = ?, body = ?, project_tag = ?, priority = ?, pinned = ?, updated_at = ?
     WHERE id = ?`,
  ).run(title, noteBody, projectTag, priority, pinned, now, id)

  const row = await db
    .prepare(`SELECT * FROM standalone_notes WHERE id = ?`)
    .get(id) as Record<string, unknown>
  res.json(mapStandaloneNote(row))
})

app.delete('/api/notes/:id', async (req, res) => {
  const id = String(req.params.id)
  const result = await db.prepare(`DELETE FROM standalone_notes WHERE id = ?`).run(id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found' })
    return
  }
  await removeNotesListOrderKey(noteItemKey({ source: 'note', id }))
  res.status(204).end()
})

app.post('/api/notes/task/:id/clear', async (req, res) => {
  const id = String(req.params.id)
  const existing = await db
    .prepare(`SELECT id FROM tasks WHERE id = ?`)
    .get(id) as { id: string } | undefined
  if (!existing) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  const now = new Date().toISOString()
  await db.prepare(`UPDATE tasks SET notes = '', updated_at = ? WHERE id = ?`).run(now, id)
  await removeNotesListOrderKey(noteItemKey({ source: 'task', id }))
  res.status(204).end()
})

app.get('/api/habits', async (req, res) => {
  const date = String(req.query.date || todayISO())
  const includeArchived = String(req.query.includeArchived || '') === '1'
  res.json(await loadHabits(date, { includeArchived }))
})

/** Historical habit check-ins — past days stay in habit_entries; today starts fresh. */
app.get('/api/habits/progress', async (req, res) => {
  const days = Number(req.query.days || 28)
  res.json(await loadHabitsProgress(days))
})

app.post('/api/habits', async (req, res) => {
  const body = req.body ?? {}
  const title = String(body.title ?? '').trim()
  if (!title) {
    res.status(400).json({ error: 'title is required' })
    return
  }
  const now = new Date().toISOString()
  const id = randomUUID()
  const maxRow = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM habits`)
    .get() as { m: number }
  const sortOrder = Number(maxRow.m) + 1

  await db.prepare(
    `INSERT INTO habits (id, title, sort_order, archived, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(id, title, sortOrder, now, now)

  const row = await db
    .prepare(`SELECT * FROM habits WHERE id = ?`)
    .get(id) as Record<string, unknown>
  res.status(201).json(mapHabit(row, null))
})

app.patch('/api/habits/reorder', async (req, res) => {
  const orderedIds = req.body?.orderedIds as string[]
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    res.status(400).json({ error: 'orderedIds required' })
    return
  }
  const now = new Date().toISOString()
  const update = await db.prepare(
    `UPDATE habits SET sort_order = ?, updated_at = ? WHERE id = ? AND archived = 0`,
  )
  const tx = db.transaction(async () => {
    for (const [index, id] of orderedIds.entries()) {
      await update.run(index, now, String(id))
    }
  })
  await tx()
  res.json({ ok: true, count: orderedIds.length })
})

app.patch('/api/habits/:id', async (req, res) => {
  const id = String(req.params.id)
  const existing = await db
    .prepare(`SELECT * FROM habits WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ error: 'Habit not found' })
    return
  }

  const body = req.body ?? {}
  const now = new Date().toISOString()
  const title =
    body.title !== undefined
      ? String(body.title).trim()
      : String(existing.title)
  if (!title) {
    res.status(400).json({ error: 'title is required' })
    return
  }
  const sortOrder =
    body.sortOrder !== undefined
      ? Number(body.sortOrder)
      : Number(existing.sort_order)
  if (!Number.isFinite(sortOrder)) {
    res.status(400).json({ error: 'sortOrder must be a number' })
    return
  }
  const archived =
    body.archived !== undefined
      ? body.archived
        ? 1
        : 0
      : Number(existing.archived)

  await db.prepare(
    `UPDATE habits
     SET title = ?, sort_order = ?, archived = ?, updated_at = ?
     WHERE id = ?`,
  ).run(title, sortOrder, archived, now, id)

  const row = await db
    .prepare(`SELECT * FROM habits WHERE id = ?`)
    .get(id) as Record<string, unknown>
  res.json(mapHabit(row, null))
})

app.delete('/api/habits/:id', async (req, res) => {
  const id = String(req.params.id)
  const result = await db.prepare(`DELETE FROM habits WHERE id = ?`).run(id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Habit not found' })
    return
  }
  res.status(204).end()
})

app.put('/api/habits/:id/entry', async (req, res) => {
  const id = String(req.params.id)
  const habit = await db
    .prepare(`SELECT * FROM habits WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!habit) {
    res.status(404).json({ error: 'Habit not found' })
    return
  }

  const body = req.body ?? {}
  const date = String(body.date || todayISO())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' })
    return
  }
  if (typeof body.completed !== 'boolean') {
    res.status(400).json({ error: 'completed must be a boolean' })
    return
  }
  const completed = body.completed ? 1 : 0
  const now = new Date().toISOString()

  const existing = await db
    .prepare(`SELECT id FROM habit_entries WHERE habit_id = ? AND date = ?`)
    .get(id, date) as { id: string } | undefined

  if (existing) {
    await db.prepare(
      `UPDATE habit_entries SET completed = ?, updated_at = ? WHERE id = ?`,
    ).run(completed, now, existing.id)
  } else {
    await db.prepare(
      `INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), id, date, completed, now, now)
  }

  res.json(mapHabit(habit, { completed }))
})

function mapMindmapListItem(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function mapMindmapFull(row: Record<string, unknown>) {
  const parsed = parseMindmapDocument(String(row.document ?? '{}'))
  const document = parsed.ok ? parsed.document : EMPTY_MINDMAP_DOCUMENT
  return {
    ...mapMindmapListItem(row),
    document,
  }
}

app.get('/api/mindmaps', async (_req, res) => {
  const rows = await db
    .prepare(
      `SELECT id, title, sort_order, created_at, updated_at
       FROM mindmaps
       ORDER BY sort_order ASC, updated_at DESC`,
    )
    .all() as Array<Record<string, unknown>>
  res.json({ mindmaps: rows.map(mapMindmapListItem) })
})

app.get('/api/mindmaps/:id', async (req, res) => {
  const id = String(req.params.id)
  const row = await db
    .prepare(`SELECT * FROM mindmaps WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!row) {
    res.status(404).json({ error: 'Mindmap not found' })
    return
  }
  res.json(mapMindmapFull(row))
})

app.post('/api/mindmaps', async (req, res) => {
  const body = req.body ?? {}
  const title = String(body.title ?? 'Untitled map').trim() || 'Untitled map'
  const now = new Date().toISOString()
  const id = randomUUID()
  const maxRow = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM mindmaps`)
    .get() as { m: number }
  const sortOrder = Number(maxRow.m) + 1

  let documentRaw = stringifyMindmapDocument(EMPTY_MINDMAP_DOCUMENT)
  if (body.document !== undefined) {
    const parsed = parseMindmapDocument(body.document)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    documentRaw = parsed.raw
  }

  await db.prepare(
    `INSERT INTO mindmaps (id, title, document, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, title, documentRaw, sortOrder, now, now)

  const row = await db
    .prepare(`SELECT * FROM mindmaps WHERE id = ?`)
    .get(id) as Record<string, unknown>
  res.status(201).json(mapMindmapFull(row))
})

app.patch('/api/mindmaps/:id', async (req, res) => {
  const id = String(req.params.id)
  const existing = await db
    .prepare(`SELECT * FROM mindmaps WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined
  if (!existing) {
    res.status(404).json({ error: 'Mindmap not found' })
    return
  }

  const body = req.body ?? {}
  const now = new Date().toISOString()
  const title =
    body.title !== undefined
      ? String(body.title).trim() || 'Untitled map'
      : String(existing.title)
  const sortOrder =
    body.sortOrder !== undefined
      ? Number(body.sortOrder)
      : Number(existing.sort_order)
  if (!Number.isFinite(sortOrder)) {
    res.status(400).json({ error: 'sortOrder must be a number' })
    return
  }

  let documentRaw = String(existing.document ?? '{}')
  if (body.document !== undefined) {
    const parsed = parseMindmapDocument(body.document)
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error })
      return
    }
    documentRaw = parsed.raw
  }

  await db.prepare(
    `UPDATE mindmaps
     SET title = ?, document = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
  ).run(title, documentRaw, sortOrder, now, id)

  const row = await db
    .prepare(`SELECT * FROM mindmaps WHERE id = ?`)
    .get(id) as Record<string, unknown>
  res.json(mapMindmapFull(row))
})

app.delete('/api/mindmaps/:id', async (req, res) => {
  const id = String(req.params.id)
  const result = await db.prepare(`DELETE FROM mindmaps WHERE id = ?`).run(id)
  if (result.changes === 0) {
    res.status(404).json({ error: 'Mindmap not found' })
    return
  }
  res.status(204).end()
})

app.get('/api/export', async (_req, res) => {
  res.json({
    exportedAt: new Date().toISOString(),
    version: 1,
    tasks: await db.prepare('SELECT * FROM tasks ORDER BY created_at').all(),
    subtasks: await db.prepare('SELECT * FROM subtasks ORDER BY position').all(),
    subtaskDayState: await db
      .prepare('SELECT * FROM subtask_day_state ORDER BY date DESC')
      .all(),
    boardColumns: await db.prepare('SELECT * FROM board_columns ORDER BY position').all(),
    dayEntries: await db.prepare('SELECT * FROM day_entries ORDER BY date DESC').all(),
    goals: await db.prepare('SELECT * FROM daily_goals ORDER BY date DESC').all(),
    timeLogs: await db.prepare('SELECT * FROM time_logs ORDER BY created_at DESC').all(),
    appSettings: await db.prepare('SELECT * FROM app_settings').all(),
    standaloneNotes: await db
      .prepare('SELECT * FROM standalone_notes ORDER BY created_at')
      .all(),
    habits: await db.prepare('SELECT * FROM habits ORDER BY sort_order, created_at').all(),
    habitEntries: await db
      .prepare('SELECT * FROM habit_entries ORDER BY date DESC')
      .all(),
    mindmaps: await db
      .prepare('SELECT * FROM mindmaps ORDER BY sort_order, created_at')
      .all(),
  })
})

app.post('/api/import', async (req, res) => {
  const payload = req.body ?? {}
  const tasks = payload.tasks
  const boardColumns = payload.boardColumns
  if (!Array.isArray(tasks) || !Array.isArray(boardColumns)) {
    res.status(400).json({
      error: 'Invalid backup: tasks and boardColumns arrays are required',
    })
    return
  }

  const subtasks = Array.isArray(payload.subtasks) ? payload.subtasks : []
  const subtaskDayState = Array.isArray(payload.subtaskDayState)
    ? payload.subtaskDayState
    : Array.isArray(payload.subtask_day_state)
      ? payload.subtask_day_state
      : []
  const dayEntries = Array.isArray(payload.dayEntries) ? payload.dayEntries : []
  const goals = Array.isArray(payload.goals) ? payload.goals : []
  const timeLogs = Array.isArray(payload.timeLogs) ? payload.timeLogs : []
  const appSettings = Array.isArray(payload.appSettings) ? payload.appSettings : []
  const standaloneNotes = Array.isArray(payload.standaloneNotes)
    ? payload.standaloneNotes
    : []
  const habits = Array.isArray(payload.habits) ? payload.habits : []
  const habitEntries = Array.isArray(payload.habitEntries)
    ? payload.habitEntries
    : Array.isArray(payload.habit_entries)
      ? payload.habit_entries
      : []
  const mindmaps = Array.isArray(payload.mindmaps) ? payload.mindmaps : []

  try {
    const tx = db.transaction(async () => {
      await db.exec(`
        DELETE FROM mindmaps;
        DELETE FROM habit_entries;
        DELETE FROM habits;
        DELETE FROM subtask_day_state;
        DELETE FROM time_logs;
        DELETE FROM day_entries;
        DELETE FROM subtasks;
        DELETE FROM daily_goals;
        DELETE FROM tasks;
        DELETE FROM board_columns;
        DELETE FROM app_settings;
        DELETE FROM standalone_notes;
      `)

      const insertCol = await db.prepare(`
        INSERT INTO board_columns (id, name, position, color, is_terminal, role, created_at, updated_at)
        VALUES (@id, @name, @position, @color, @is_terminal, @role, @created_at, @updated_at)
      `)
      for (const col of boardColumns as Record<string, unknown>[]) {
        const role =
          parseColumnRole(col.role) ||
          (Number(col.is_terminal) ? 'done' : 'custom')
        await insertCol.run({
          id: String(col.id),
          name: String(col.name || 'Column'),
          position: Number(col.position ?? 0),
          color: String(col.color || '#2b63e3'),
          is_terminal: role === 'done' || Number(col.is_terminal) ? 1 : 0,
          role,
          created_at: String(col.created_at || new Date().toISOString()),
          updated_at: String(col.updated_at || new Date().toISOString()),
        })
      }

      const insertTask = await db.prepare(`
        INSERT INTO tasks (
          id, title, notes, category, project_tag, priority, status, is_master,
          column_id, sort_order, board_sort, cadence_weekday, cadence_month_day,
          created_at, updated_at
        ) VALUES (
          @id, @title, @notes, @category, @project_tag, @priority, @status, @is_master,
          @column_id, @sort_order, @board_sort, @cadence_weekday, @cadence_month_day,
          @created_at, @updated_at
        )
      `)
      for (const t of tasks as Record<string, unknown>[]) {
        const cat = String(t.category || 'Daily')
        const cadence = resolveCadenceFields(
          cat,
          t.cadence_weekday ?? t.cadenceWeekday ?? null,
          t.cadence_month_day ?? t.cadenceMonthDay ?? null,
        )
        await insertTask.run({
          id: String(t.id),
          title: String(t.title || 'Untitled'),
          notes: String(t.notes ?? ''),
          category: cat,
          project_tag: String(t.project_tag || 'Work'),
          priority: String(t.priority || 'Medium'),
          status: String(t.status || 'todo'),
          is_master: Number(t.is_master ?? 1),
          column_id: t.column_id == null ? null : String(t.column_id),
          sort_order: Number(t.sort_order ?? 0),
          board_sort: Number(t.board_sort ?? t.sort_order ?? 0),
          cadence_weekday: cadence.cadenceWeekday,
          cadence_month_day: cadence.cadenceMonthDay,
          created_at: String(t.created_at || new Date().toISOString()),
          updated_at: String(t.updated_at || new Date().toISOString()),
        })
      }

      const insertSub = await db.prepare(`
        INSERT INTO subtasks (id, task_id, title, done, position, created_at, updated_at)
        VALUES (@id, @task_id, @title, @done, @position, @created_at, @updated_at)
      `)
      for (const s of subtasks as Record<string, unknown>[]) {
        await insertSub.run({
          id: String(s.id),
          task_id: String(s.task_id),
          title: String(s.title || ''),
          done: Number(s.done ?? 0),
          position: Number(s.position ?? 0),
          created_at: String(s.created_at || new Date().toISOString()),
          updated_at: String(s.updated_at || new Date().toISOString()),
        })
      }

      const insertSds = await db.prepare(`
        INSERT INTO subtask_day_state (subtask_id, date, done, updated_at)
        VALUES (@subtask_id, @date, @done, @updated_at)
      `)
      for (const s of subtaskDayState as Record<string, unknown>[]) {
        await insertSds.run({
          subtask_id: String(s.subtask_id),
          date: String(s.date),
          done: Number(s.done ?? 0),
          updated_at: String(s.updated_at || new Date().toISOString()),
        })
      }

      const insertDay = await db.prepare(`
        INSERT INTO day_entries (
          id, task_id, date, completed, hours, timer_started_at, timer_subtask_id, notes, created_at, updated_at
        ) VALUES (
          @id, @task_id, @date, @completed, @hours, @timer_started_at, @timer_subtask_id, @notes, @created_at, @updated_at
        )
      `)
      for (const d of dayEntries as Record<string, unknown>[]) {
        await insertDay.run({
          id: String(d.id),
          task_id: String(d.task_id),
          date: String(d.date),
          completed: Number(d.completed ?? 0),
          hours: Number(d.hours ?? 0),
          timer_started_at: d.timer_started_at == null ? null : String(d.timer_started_at),
          timer_subtask_id:
            d.timer_subtask_id == null && d.timerSubtaskId == null
              ? null
              : String(d.timer_subtask_id ?? d.timerSubtaskId),
          notes: String(d.notes ?? ''),
          created_at: String(d.created_at || new Date().toISOString()),
          updated_at: String(d.updated_at || new Date().toISOString()),
        })
      }

      const insertGoal = await db.prepare(`
        INSERT INTO daily_goals (date, goal, updated_at)
        VALUES (@date, @goal, @updated_at)
      `)
      for (const g of goals as Record<string, unknown>[]) {
        await insertGoal.run({
          date: String(g.date),
          goal: String(g.goal ?? ''),
          updated_at: String(g.updated_at || new Date().toISOString()),
        })
      }

      const insertLog = await db.prepare(`
        INSERT INTO time_logs (id, task_id, date, hours, note, created_at, subtask_id)
        VALUES (@id, @task_id, @date, @hours, @note, @created_at, @subtask_id)
      `)
      for (const l of timeLogs as Record<string, unknown>[]) {
        await insertLog.run({
          id: String(l.id),
          task_id: String(l.task_id),
          date: String(l.date),
          hours: Number(l.hours ?? 0),
          note: String(l.note ?? ''),
          created_at: String(l.created_at || new Date().toISOString()),
          subtask_id:
            l.subtask_id == null && l.subtaskId == null
              ? null
              : String(l.subtask_id ?? l.subtaskId),
        })
      }

      const insertSetting = await db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (@key, @value, @updated_at)
      `)
      for (const s of appSettings as Record<string, unknown>[]) {
        await insertSetting.run({
          key: String(s.key),
          value: String(s.value ?? ''),
          updated_at: String(s.updated_at || new Date().toISOString()),
        })
      }

      const insertNote = await db.prepare(`
        INSERT INTO standalone_notes
          (id, title, body, project_tag, priority, pinned, created_at, updated_at)
        VALUES (@id, @title, @body, @project_tag, @priority, @pinned, @created_at, @updated_at)
      `)
      for (const n of standaloneNotes as Record<string, unknown>[]) {
        await insertNote.run({
          id: String(n.id),
          title: String(n.title ?? ''),
          body: String(n.body ?? ''),
          project_tag: String(n.project_tag ?? 'Personal'),
          priority: String(n.priority ?? 'Medium'),
          pinned: Number(n.pinned) ? 1 : 0,
          created_at: String(n.created_at || new Date().toISOString()),
          updated_at: String(n.updated_at || new Date().toISOString()),
        })
      }

      const insertHabit = await db.prepare(`
        INSERT INTO habits (id, title, sort_order, archived, created_at, updated_at)
        VALUES (@id, @title, @sort_order, @archived, @created_at, @updated_at)
      `)
      for (const h of habits as Record<string, unknown>[]) {
        await insertHabit.run({
          id: String(h.id),
          title: String(h.title || 'Untitled'),
          sort_order: Number(h.sort_order ?? h.sortOrder ?? 0),
          archived: Number(h.archived) ? 1 : 0,
          created_at: String(h.created_at || new Date().toISOString()),
          updated_at: String(h.updated_at || new Date().toISOString()),
        })
      }

      const insertHabitEntry = await db.prepare(`
        INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
        VALUES (@id, @habit_id, @date, @completed, @created_at, @updated_at)
      `)
      for (const e of habitEntries as Record<string, unknown>[]) {
        await insertHabitEntry.run({
          id: String(e.id),
          habit_id: String(e.habit_id ?? e.habitId),
          date: String(e.date),
          completed: Number(e.completed ?? 0),
          created_at: String(e.created_at || new Date().toISOString()),
          updated_at: String(e.updated_at || new Date().toISOString()),
        })
      }

      const insertMindmap = await db.prepare(`
        INSERT INTO mindmaps (id, title, document, sort_order, created_at, updated_at)
        VALUES (@id, @title, @document, @sort_order, @created_at, @updated_at)
      `)
      for (const m of mindmaps as Record<string, unknown>[]) {
        const parsed = parseMindmapDocument(
          m.document ?? EMPTY_MINDMAP_DOCUMENT,
        )
        if (!parsed.ok) {
          throw new Error(`Invalid mindmap document for ${String(m.id)}: ${parsed.error}`)
        }
        await insertMindmap.run({
          id: String(m.id),
          title: String(m.title || 'Untitled map'),
          document: parsed.raw,
          sort_order: Number(m.sort_order ?? m.sortOrder ?? 0),
          created_at: String(m.created_at || new Date().toISOString()),
          updated_at: String(m.updated_at || new Date().toISOString()),
        })
      }
    })
    await tx()
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Import failed',
    })
    return
  }

  res.json({
    ok: true,
    counts: {
      tasks: tasks.length,
      boardColumns: boardColumns.length,
      subtasks: subtasks.length,
      dayEntries: dayEntries.length,
      notes: standaloneNotes.length,
      habits: habits.length,
      habitEntries: habitEntries.length,
      mindmaps: mindmaps.length,
    },
  })
})

  return app
}