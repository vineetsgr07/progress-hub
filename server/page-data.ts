import {
  cadenceOptsFromRow,
  isPeriodCategory,
  previousCadenceDay,
  visibleOnToday,
} from './cadence.js'
import { buildAnalyticsInsight } from './analytics-insight.js'
import {
  loadWeekBundle,
  computeDayProgress,
  type DayProgress,
} from './day-progress.js'
import { db, getSetting } from './db.js'
import { buildHabitsProgress } from './habits-history.js'
import { STREAK_LOOKBACK_DAYS, isoDateKey, streakFromDayTotals, streakWindowStart } from './streak.js'
import { DAILY_DONE_AS_OF_SQL } from './subtask-day-done.js'
import {
  NOTES_EXCERPT_SQL_CHARS,
  notesExcerpt,
  notesHasBody,
  notesListCutoffIso,
  notesStandaloneWhere,
  notesTaskWhere,
  parseNoteScope,
  parseNoteSort,
  parseNoteSource,
  parsePinnedOnly,
  parseNotesLimit,
  parseNotesListOrder,
  sortNoteItems,
  type NoteListItem,
  type NoteScope,
  type NoteSort,
  type NoteSource,
} from './notes-list.js'

export const NOTES_LIST_ORDER_KEY = 'notes_list_order'

export async function computeStreak(endDate: string): Promise<number> {
  const startDate = streakWindowStart(endDate, STREAK_LOOKBACK_DAYS)
  const rows = (await db
    .prepare(
      `SELECT date, COALESCE(SUM(completed), 0) AS c
       FROM day_entries
       WHERE date <= ? AND date >= ?
       GROUP BY date`,
    )
    .all(endDate, startDate)) as Array<{ date: unknown; c: unknown }>
  return streakFromDayTotals(endDate, rows, STREAK_LOOKBACK_DAYS)
}

export async function loadDaySessions(date: string) {
  const rows = (await db
    .prepare(
      `SELECT tl.id, tl.task_id, tl.hours, tl.created_at, tl.subtask_id,
              t.title, t.project_tag, t.priority,
              s.title AS subtask_title
       FROM time_logs tl
       JOIN tasks t ON t.id = tl.task_id
       LEFT JOIN subtasks s ON s.id = tl.subtask_id
       WHERE tl.date = ?
       ORDER BY tl.created_at ASC`,
    )
    .all(date)) as Array<Record<string, unknown>>

  const sessions = rows.map((row) => ({
    id: String(row.id),
    taskId: String(row.task_id),
    title: String(row.title),
    projectTag: String(row.project_tag),
    priority: String(row.priority),
    subtaskId: row.subtask_id == null ? null : String(row.subtask_id),
    subtaskTitle: row.subtask_title == null ? null : String(row.subtask_title),
    hours: Number(row.hours),
    createdAt: String(row.created_at),
    running: false,
  }))

  const running = (await db
    .prepare(
      `SELECT d.id, d.task_id, d.timer_started_at, d.timer_subtask_id,
              t.title, t.project_tag, t.priority,
              s.title AS subtask_title
       FROM day_entries d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN subtasks s ON s.id = d.timer_subtask_id
       WHERE d.date = ? AND d.timer_started_at IS NOT NULL`,
    )
    .all(date)) as Array<Record<string, unknown>>

  for (const r of running) {
    const started = new Date(String(r.timer_started_at)).getTime()
    const live = Number.isFinite(started)
      ? Math.max(0, (Date.now() - started) / 3_600_000)
      : 0
    sessions.push({
      id: `live-${r.id}`,
      taskId: String(r.task_id),
      title: String(r.title),
      projectTag: String(r.project_tag),
      priority: String(r.priority),
      subtaskId: r.timer_subtask_id == null ? null : String(r.timer_subtask_id),
      subtaskTitle: r.subtask_title == null ? null : String(r.subtask_title),
      hours: live,
      createdAt: String(r.timer_started_at),
      running: true,
    })
  }

  return sessions
}

export async function loadStats(
  date: string,
  opts?: { insight?: boolean; streak?: number | false; day?: DayProgress },
) {
  const day = opts?.day ?? (await computeDayProgress(date))
  const taskIds = day.taskIds
  const withInsight = Boolean(opts?.insight)

  let checklistDone = 0
  let checklistTotal = 0
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => '?').join(',')
    const checklist = (await db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(
             CASE
               WHEN t.category = 'Daily' THEN ${DAILY_DONE_AS_OF_SQL}
               WHEN s.done = 1 THEN 1
               ELSE 0
             END
           ) AS done
         FROM subtasks s
         JOIN tasks t ON t.id = s.task_id
         WHERE s.task_id IN (${placeholders})`,
      )
      .get(date, ...taskIds)) as { total: number; done: number | null }
    checklistTotal = Number(checklist.total)
    checklistDone = Number(checklist.done ?? 0)
  }

  const history = withInsight
    ? await db
        .prepare(
          `SELECT date,
                  SUM(completed) AS completed,
                  COUNT(*) AS total,
                  ROUND((SUM(hours))::numeric, 2)::float AS hours
           FROM day_entries
           GROUP BY date
           ORDER BY date DESC
           LIMIT 30`,
        )
        .all()
    : []

  const insight = withInsight ? await buildAnalyticsInsight(date, 14) : null
  const byCategory = insight
    ? insight.hoursByCategory.map((row) => ({
        category: row.key,
        count: row.count,
        done: row.done,
        hours: row.hours,
        sharePercent: row.sharePercent,
        priorHours: row.priorHours,
      }))
    : (
        (await db
          .prepare(
            `SELECT category AS key,
                    COUNT(*) AS count,
                    SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
             FROM tasks
             WHERE is_master = 1
             GROUP BY category`,
          )
          .all()) as Array<{ key: string; count: number; done: number }>
      ).map((row) => ({
        category: row.key,
        count: Number(row.count),
        done: Number(row.done),
        hours: 0,
      }))
  const byProject = insight
    ? insight.hoursByProject.map((row) => ({
        projectTag: row.key,
        count: row.count,
        done: row.done,
        hours: row.hours,
        sharePercent: row.sharePercent,
        priorHours: row.priorHours,
      }))
    : []

  const remaining = Math.max(0, day.total - day.completed)
  const sessions = await loadDaySessions(date)
  const streak =
    opts?.streak === false
      ? 0
      : typeof opts?.streak === 'number'
        ? opts.streak
        : await computeStreak(date)

  return {
    date,
    today: {
      completed: day.completed,
      total: day.total,
      remaining,
      hours: day.hours,
      percent: day.percent,
      checklistDone,
      checklistTotal,
      checklistPercent: checklistTotal
        ? Math.round((checklistDone / checklistTotal) * 100)
        : 0,
    },
    streak,
    history,
    byCategory,
    byProject,
    sessions,
    insight: insight
      ? {
          rangeStart: insight.rangeStart,
          rangeEnd: insight.rangeEnd,
          unfinishedDaily: insight.unfinishedDaily,
          unfinishedDailyTotalHours: insight.unfinishedDailyTotalHours,
          goals: insight.goals,
          todayBudget: insight.todayBudget,
          budgetSeries: insight.budgetSeries,
        }
      : undefined,
  }
}

export async function loadWeek(date: string, streak?: number) {
  const { week } = await loadWeekBundle(date)
  return {
    date,
    ...week,
    streak: streak ?? (await computeStreak(date)),
  }
}

export async function loadTodayPulse(date: string) {
  const { week, day } = await loadWeekBundle(date)
  const [statsCore, streak] = await Promise.all([
    loadStats(date, { insight: false, streak: false, day }),
    computeStreak(date),
  ])
  return {
    stats: { ...statsCore, streak },
    week: { date, ...week, streak },
  }
}

export type TaskListOpts = {
  category?: string | null
  master?: boolean
}

export async function loadTaskRows(
  date: string,
  opts?: TaskListOpts,
): Promise<Record<string, unknown>[]> {
  const category = opts?.category ?? null
  const masterOnly = Boolean(opts?.master)

  let rows: Record<string, unknown>[]
  if (masterOnly) {
    rows = (await db
      .prepare(
        `SELECT * FROM tasks WHERE is_master = 1
         ${category && category !== 'All' ? 'AND category = @category' : ''}
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(category && category !== 'All' ? { category } : {})) as Record<
      string,
      unknown
    >[]
  } else if (category && isPeriodCategory(category)) {
    rows = (await db
      .prepare(
        `SELECT * FROM tasks WHERE is_master = 1 AND category = ?
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(category)) as Record<string, unknown>[]
  } else if (category && category !== 'All') {
    rows = (await db
      .prepare(
        `SELECT * FROM tasks WHERE is_master = 1 AND category = ?
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(category)) as Record<string, unknown>[]
  } else {
    rows = (await db
      .prepare(
        `SELECT * FROM tasks WHERE is_master = 1
         AND category NOT IN (
           'Weekly', 'Monthly', 'Quarterly', 'Goal', 'Projects', 'Transactional'
         )
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all()) as Record<string, unknown>[]

    const projectOnDay = (await db
      .prepare(
        `SELECT t.* FROM tasks t
         INNER JOIN day_entries d ON d.task_id = t.id AND d.date = ?
         WHERE t.is_master = 1
           AND t.category IN ('Projects', 'Transactional')
         ORDER BY t.sort_order ASC, t.created_at ASC`,
      )
      .all(date)) as Record<string, unknown>[]
    rows.push(...projectOnDay)

    const periodRows = (await db
      .prepare(
        `SELECT * FROM tasks WHERE is_master = 1
         AND category IN ('Weekly', 'Monthly', 'Quarterly', 'Goal')
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all()) as Record<string, unknown>[]

    const periodMeta = periodRows.map((row) => {
      const cat = String(row.category)
      const createdDateISO = String(row.created_at || '').slice(0, 10)
      const cadenceOpts = cadenceOptsFromRow({
        category: cat,
        cadence_weekday:
          row.cadence_weekday == null ? null : Number(row.cadence_weekday),
        cadence_month_day:
          row.cadence_month_day == null ? null : Number(row.cadence_month_day),
      })
      return {
        row,
        cat,
        createdDateISO,
        cadenceOpts,
        prev: previousCadenceDay(cat, date, cadenceOpts),
      }
    })
    const completedByTask = new Map<string, Set<string>>()
    const withPrev = periodMeta.filter((item) => item.prev)
    if (withPrev.length > 0) {
      const ids = [...new Set(withPrev.map((item) => String(item.row.id)))]
      const minPrev = withPrev.reduce(
        (min, item) => (item.prev! < min ? item.prev! : min),
        withPrev[0].prev!,
      )
      const placeholders = ids.map(() => '?').join(',')
      const doneRows = (await db
        .prepare(
          `SELECT task_id, date FROM day_entries
           WHERE completed = 1 AND task_id IN (${placeholders})
             AND date >= ? AND date < ?`,
        )
        .all(...ids, minPrev, date)) as Array<{ task_id: string; date: unknown }>
      for (const done of doneRows) {
        const taskId = String(done.task_id)
        const set = completedByTask.get(taskId) ?? new Set<string>()
        set.add(isoDateKey(done.date))
        completedByTask.set(taskId, set)
      }
    }

    for (const item of periodMeta) {
      const occurrenceCompletedBeforeDate = item.prev
        ? Boolean(
            [...(completedByTask.get(String(item.row.id)) ?? [])].some(
              (doneDate) => doneDate >= item.prev! && doneDate < date,
            ),
          )
        : false
      if (
        !visibleOnToday(
          item.cat,
          date,
          occurrenceCompletedBeforeDate,
          null,
          item.createdDateISO || null,
          item.cadenceOpts,
        )
      ) {
        continue
      }
      rows.push(item.row)
    }
    rows.sort((a, b) => {
      const so = Number(a.sort_order) - Number(b.sort_order)
      if (so !== 0) return so
      return String(a.created_at).localeCompare(String(b.created_at))
    })
  }

  return rows
}

export function mapHabit(
  row: Record<string, unknown>,
  entry?: { completed: number } | null,
) {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completed: entry ? Boolean(entry.completed) : false,
  }
}

export async function loadHabits(
  date: string,
  opts?: { includeArchived?: boolean },
) {
  const includeArchived = Boolean(opts?.includeArchived)
  const habits = (await db
    .prepare(
      includeArchived
        ? `SELECT * FROM habits ORDER BY sort_order ASC, created_at ASC`
        : `SELECT * FROM habits WHERE archived = 0 ORDER BY sort_order ASC, created_at ASC`,
    )
    .all()) as Array<Record<string, unknown>>

  const entryByHabit = new Map<string, { completed: number }>()
  if (habits.length > 0) {
    const ids = habits.map((row) => String(row.id))
    const placeholders = ids.map(() => '?').join(',')
    const entries = (await db
      .prepare(
        `SELECT habit_id, completed FROM habit_entries
         WHERE date = ? AND habit_id IN (${placeholders})`,
      )
      .all(date, ...ids)) as Array<{ habit_id: string; completed: number }>
    for (const entry of entries) {
      entryByHabit.set(String(entry.habit_id), { completed: Number(entry.completed) })
    }
  }

  let completed = 0
  const mapped = []
  for (const row of habits) {
    const entry = entryByHabit.get(String(row.id))
    if (entry?.completed) completed += 1
    mapped.push(mapHabit(row, entry ?? null))
  }

  return {
    date,
    habits: mapped,
    summary: { completed, total: mapped.length },
  }
}

export async function loadHabitsProgress(days = 28) {
  return buildHabitsProgress(days)
}

export async function readNotesListOrder(): Promise<string[]> {
  return parseNotesListOrder(await getSetting(NOTES_LIST_ORDER_KEY))
}

export type NotesQuery = {
  q?: string
  project?: string
  priority?: string
  source?: string
  sort?: string
  scope?: string
  limit?: string | number
  pinned?: string | boolean
}

export async function loadNotes(opts?: NotesQuery): Promise<{
  notes: NoteListItem[]
  olderCount: number
}> {
  const q = String(opts?.q || '')
    .trim()
    .toLowerCase()
  const project = String(opts?.project || '').trim()
  const priority = String(opts?.priority || '').trim()
  const sourceFilter = parseNoteSource(String(opts?.source || ''))
  const sort = parseNoteSort(String(opts?.sort || ''))
  const pinnedOnly = parsePinnedOnly(String(opts?.pinned ?? ''))
  const scope = pinnedOnly ? 'all' : parseNoteScope(String(opts?.scope || ''))
  const limit = parseNotesLimit(opts?.limit)
  return loadNotesResolved({
    q,
    project,
    priority,
    sourceFilter,
    sort,
    scope,
    limit,
    pinnedOnly,
  })
}

async function loadNotesResolved(opts: {
  q: string
  project: string
  priority: string
  sourceFilter: NoteSource | 'all'
  sort: NoteSort
  scope: NoteScope
  limit: number
  pinnedOnly: boolean
}): Promise<{ notes: NoteListItem[]; olderCount: number }> {
  const cutoffIso = notesListCutoffIso()
  const filter = {
    q: opts.q,
    project: opts.project,
    priority: opts.priority,
    scope: opts.scope,
    cutoffIso,
    pinnedOnly: opts.pinnedOnly,
  }
  const items: NoteListItem[] = []

  if (
    !opts.pinnedOnly &&
    (opts.sourceFilter === 'all' || opts.sourceFilter === 'task')
  ) {
    const where = notesTaskWhere(filter)
    const tasks = (await db
      .prepare(
        `SELECT id, title, substr(notes, 1, ?) AS notes, project_tag, priority, created_at, updated_at
         FROM tasks
         WHERE ${where.sql}`,
      )
      .all(NOTES_EXCERPT_SQL_CHARS, ...where.params)) as Array<
      Record<string, unknown>
    >
    for (const row of tasks) {
      const body = String(row.notes ?? '')
      if (!notesHasBody(body)) continue
      items.push({
        id: String(row.id),
        source: 'task',
        title: String(row.title ?? ''),
        excerpt: notesExcerpt(body),
        projectTag: String(row.project_tag ?? ''),
        priority: String(row.priority ?? 'Medium'),
        pinned: false,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })
    }
  }

  if (opts.sourceFilter === 'all' || opts.sourceFilter === 'note') {
    const where = notesStandaloneWhere(filter)
    const notes = (await db
      .prepare(
        `SELECT id, title, substr(body, 1, ?) AS body, project_tag, priority, pinned, created_at, updated_at
         FROM standalone_notes
         WHERE ${where.sql}`,
      )
      .all(NOTES_EXCERPT_SQL_CHARS, ...where.params)) as Array<
      Record<string, unknown>
    >
    for (const row of notes) {
      items.push({
        id: String(row.id),
        source: 'note',
        title: String(row.title ?? '') || 'Untitled note',
        excerpt: notesExcerpt(String(row.body ?? '')),
        projectTag: String(row.project_tag ?? 'Personal'),
        priority: String(row.priority ?? 'Medium'),
        pinned: Boolean(row.pinned),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      })
    }
  }

  const olderCount =
    opts.scope === 'recent' ? await countOlderNotes(opts) : 0
  const manualOrder = opts.sort === 'manual' ? await readNotesListOrder() : []
  return {
    notes: sortNoteItems(items, opts.sort, manualOrder).slice(0, opts.limit),
    olderCount,
  }
}

async function countOlderNotes(opts: {
  q: string
  project: string
  priority: string
  sourceFilter: NoteSource | 'all'
}): Promise<number> {
  const cutoffIso = notesListCutoffIso()
  const filter = {
    q: opts.q,
    project: opts.project,
    priority: opts.priority,
    scope: 'older' as const,
    cutoffIso,
  }
  let total = 0
  if (opts.sourceFilter === 'all' || opts.sourceFilter === 'task') {
    const where = notesTaskWhere(filter)
    const row = (await db
      .prepare(`SELECT COUNT(*) AS c FROM tasks WHERE ${where.sql}`)
      .get(...where.params)) as { c: number }
    total += Number(row.c) || 0
  }
  if (opts.sourceFilter === 'all' || opts.sourceFilter === 'note') {
    const where = notesStandaloneWhere(filter)
    const row = (await db
      .prepare(`SELECT COUNT(*) AS c FROM standalone_notes WHERE ${where.sql}`)
      .get(...where.params)) as { c: number }
    total += Number(row.c) || 0
  }
  return total
}

export async function loadTodayPage<T>(
  opts: { date: string; category?: string | null; master?: boolean },
  mapTasks: (rows: Record<string, unknown>[], date: string) => Promise<T[]>,
) {
  const { date, category = null, master = false } = opts
  const includeHabitsWeek = !master && category !== 'Projects'

  const tasksPromise = loadTaskRows(date, { category, master }).then((rows) =>
    mapTasks(rows, date),
  )

  if (master) {
    const [tasks, stats] = await Promise.all([
      tasksPromise,
      loadStats(date, { insight: false }),
    ])
    return { date, tasks, stats }
  }

  if (!includeHabitsWeek) {
    const [tasks, stats] = await Promise.all([
      tasksPromise,
      loadStats(date, { insight: false }),
    ])
    return { date, tasks, stats }
  }

  const [tasks, pulse, habits] = await Promise.all([
    tasksPromise,
    loadTodayPulse(date),
    loadHabits(date),
  ])
  return {
    date,
    tasks,
    stats: pulse.stats,
    week: pulse.week,
    habits,
  }
}

export async function loadAnalyticsPage(date: string) {
  const [stats, habitsProgress] = await Promise.all([
    loadStats(date, { insight: true }),
    loadHabitsProgress(28),
  ])
  return { date, stats, habitsProgress }
}
