import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCHEMA_SQL } from './schema-sql.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')

export type ColumnRole = 'backlog' | 'doing' | 'done' | 'custom'

export type SqlParams = unknown[] | Record<string, unknown>

type QueryResult = {
  rows: Record<string, unknown>[]
  rowCount: number
}

type SqlSession = {
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>
  exec: (sql: string) => Promise<void>
}

type RootSession = SqlSession & {
  transaction: <T>(fn: () => Promise<T>) => Promise<T>
}

const als = new AsyncLocalStorage<SqlSession>()

let rootPromise: Promise<RootSession> | null = null
let postgresSql: { end: (opts?: { timeout?: number }) => Promise<void> } | null = null

function resetPostgres() {
  rootPromise = null
  const sql = postgresSql
  postgresSql = null
  if (sql) void sql.end({ timeout: 1 }).catch(() => {})
}

function localDataPath() {
  const configured = process.env.TRACKER_DB_PATH
  if (configured) return configured
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  return path.join(dataDir, 'pglite')
}

function rewriteSql(sql: string): string {
  return sql.replace(/ON CONFLICT\s*\(/gi, 'ON CONFLICT (')
}

function bindSql(
  sql: string,
  params?: SqlParams,
): { text: string; args: unknown[] } {
  const text = rewriteSql(sql)
  if (params == null) return { text, args: [] }
  if (Array.isArray(params)) {
    let i = 0
    return {
      text: text.replace(/\?/g, () => `$${++i}`),
      args: params,
    }
  }
  const args: unknown[] = []
  const named = text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
    args.push(params[name] ?? null)
    return `$${args.length}`
  })
  return { text: named, args }
}

function coerceValue(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  return value
}

function coerceRow(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    next[key] = coerceValue(value)
  }
  return next
}

export const POSTGRES_QUERY_TIMEOUT_MS = 8_000

export function postgresPoolOptions(databaseUrl: string) {
  return {
    max: 8,
    prepare: false as const,
    fetch_types: false as const,
    ssl: (databaseUrl.includes('localhost') ? false : 'require') as false | 'require',
    idle_timeout: 8,
    max_lifetime: 60,
    connect_timeout: 5,
    onnotice: () => {},
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('timeout'))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function isDeadDbConnection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /CONNECTION|ECONNRESET|EPIPE|ECONNREFUSED|not queryable|connection.*closed|timeout|terminat|CLIENT_CLOSED/i.test(
    message,
  )
}

async function createPostgresSession(databaseUrl: string): Promise<RootSession> {
  const postgres = (await import('postgres')).default
  const sql = postgres(databaseUrl, postgresPoolOptions(databaseUrl))
  postgresSql = sql

  const run = async (
    client: ReturnType<typeof postgres>,
    query: string,
    params?: unknown[],
  ): Promise<QueryResult> => {
    try {
      const rows = (await withTimeout(
        client.unsafe(query, params ?? []),
        POSTGRES_QUERY_TIMEOUT_MS,
      )) as unknown as Record<string, unknown>[]
      const rowCount = Array.isArray(rows) ? rows.length : Number(rows?.count ?? 0)
      const list = Array.isArray(rows) ? rows.map((row) => coerceRow(row)) : []
      return {
        rows: list,
        rowCount: typeof (rows as { count?: number })?.count === 'number'
          ? Number((rows as { count: number }).count)
          : rowCount,
      }
    } catch (error) {
      if (isDeadDbConnection(error)) resetPostgres()
      throw error
    }
  }

  const sessionFor = (client: ReturnType<typeof postgres>): SqlSession => ({
    query: (query, params) => run(client, query, params),
    exec: async (query) => {
      try {
        await withTimeout(client.unsafe(query), POSTGRES_QUERY_TIMEOUT_MS)
      } catch (error) {
        if (isDeadDbConnection(error)) resetPostgres()
        throw error
      }
    },
  })

  const root = sessionFor(sql)
  return {
    ...root,
    transaction: async (fn) =>
      sql.begin(async (tx) =>
        als.run(sessionFor(tx as unknown as ReturnType<typeof postgres>), fn),
      ) as Promise<ReturnType<typeof fn>>,
  }
}

async function createPgliteSession(dataPath: string): Promise<RootSession> {
  const parent = path.dirname(dataPath)
  if (parent && !fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = await new PGlite(dataPath)

  const run = async (
    client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> },
    query: string,
    params?: unknown[],
  ): Promise<QueryResult> => {
    const result = await client.query(query, params)
    const rows = (result.rows as Record<string, unknown>[]).map(coerceRow)
    return {
      rows,
      rowCount: Number(result.affectedRows ?? rows.length),
    }
  }

  const sessionFor = (client: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>
    exec?: (sql: string) => Promise<unknown>
  }): SqlSession => ({
    query: (query, params) => run(client, query, params),
    exec: async (query) => {
      if (client.exec) {
        await client.exec(query)
        return
      }
      await client.query(query)
    },
  })

  const root = sessionFor(pg)
  return {
    ...root,
    transaction: async (fn) =>
      pg.transaction(async (tx) => als.run(sessionFor(tx), fn)),
  }
}

function getRoot(): Promise<RootSession> {
  if (!rootPromise) {
    const databaseUrl = process.env.DATABASE_URL
    rootPromise = (databaseUrl
      ? createPostgresSession(databaseUrl)
      : createPgliteSession(localDataPath())
    ).catch((error) => {
      resetPostgres()
      throw error
    })
  }
  return rootPromise
}

async function session(): Promise<SqlSession> {
  return als.getStore() ?? (await getRoot())
}

async function execSql(sql: string): Promise<void> {
  const run = async () => {
    const s = await session()
    const chunks = sql
      .split(/;\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (chunks.length <= 1) {
      await s.exec(rewriteSql(sql))
      return
    }
    for (const chunk of chunks) {
      await s.exec(rewriteSql(chunk.endsWith(';') ? chunk : `${chunk};`))
    }
  }
  try {
    await run()
  } catch (error) {
    if (als.getStore() || !process.env.DATABASE_URL || !isDeadDbConnection(error)) {
      throw error
    }
    await run()
  }
}

async function querySql(sql: string, params?: SqlParams): Promise<QueryResult> {
  const bound = bindSql(sql, params)
  try {
    const s = await session()
    return await s.query(bound.text, bound.args)
  } catch (error) {
    if (als.getStore() || !process.env.DATABASE_URL || !isDeadDbConnection(error)) {
      throw error
    }
    const s = await session()
    return s.query(bound.text, bound.args)
  }
}

export type Statement = {
  get: (...args: unknown[]) => Promise<Record<string, unknown> | undefined>
  all: (...args: unknown[]) => Promise<Record<string, unknown>[]>
  run: (...args: unknown[]) => Promise<{ changes: number }>
}

function asParams(args: unknown[]): SqlParams | undefined {
  if (args.length === 0) return undefined
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return args[0] as Record<string, unknown>
  }
  return args
}

export const db = {
  prepare(sql: string): Statement {
    return {
      get: async (...args: unknown[]) => {
        const result = await querySql(sql, asParams(args))
        return result.rows[0]
      },
      all: async (...args: unknown[]) => {
        const result = await querySql(sql, asParams(args))
        return result.rows
      },
      run: async (...args: unknown[]) => {
        const result = await querySql(sql, asParams(args))
        return { changes: result.rowCount }
      },
    }
  },
  exec: (sql: string) => execSql(sql),
  close: async () => {},
  transaction<T>(fn: () => Promise<T> | T): () => Promise<T> {
    return async () => {
      const root = await getRoot()
      return root.transaction(async () => await fn())
    }
  },
}

async function publicTableExists(name: string) {
  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ?`,
    )
    .get(name)
  return Boolean(row)
}

async function hasColumn(table: string, column: string) {
  const row = await db
    .prepare(
      `SELECT 1 AS ok
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`,
    )
    .get(table, column)
  return Boolean(row)
}

function inferRoleFromName(name: string, isTerminal: boolean): ColumnRole {
  if (isTerminal) return 'done'
  const n = name.toLowerCase()
  if (n.includes('backlog') || n.includes('to do') || n === 'todo') return 'backlog'
  if (n.includes('progress') || n.includes('doing')) return 'doing'
  if (n.includes('done') || n.includes('complete')) return 'done'
  return 'custom'
}

export async function migrate() {
  const hasTasks = await publicTableExists('tasks')
  if (!hasTasks) {
    await db.exec(SCHEMA_SQL)
  } else if (process.env.DATABASE_URL) {
    // Hosted schema is applied via supabase/migrations — skip DDL/backfill on
    // every Vercel cold start (those round-trips were exceeding the 30s limit).
    return
  }

  if (!(await hasColumn('tasks', 'column_id'))) {
    await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS column_id TEXT`)
  }
  if (!(await hasColumn('tasks', 'sort_order'))) {
    await db.exec(
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`,
    )
  }
  if (!(await hasColumn('tasks', 'board_sort'))) {
    await db.exec(
      `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS board_sort INTEGER NOT NULL DEFAULT 0`,
    )
  }
  if (!(await hasColumn('board_columns', 'role'))) {
    await db.exec(
      `ALTER TABLE board_columns ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'custom'`,
    )
  }
  if (!(await hasColumn('tasks', 'cadence_weekday'))) {
    await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cadence_weekday INTEGER`)
  }
  if (!(await hasColumn('tasks', 'cadence_month_day'))) {
    await db.exec(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cadence_month_day INTEGER`)
  }
  if (!(await hasColumn('day_entries', 'timer_subtask_id'))) {
    await db.exec(
      `ALTER TABLE day_entries ADD COLUMN IF NOT EXISTS timer_subtask_id TEXT`,
    )
  }
  if (!(await hasColumn('time_logs', 'subtask_id'))) {
    await db.exec(`ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS subtask_id TEXT`)
  }

  const renamedAt = new Date().toISOString()
  await db
    .prepare(
      `UPDATE tasks SET category = 'Goal', updated_at = ?
       WHERE category = 'Yearly'`,
    )
    .run(renamedAt)
  await db
    .prepare(
      `UPDATE tasks SET category = 'Projects', updated_at = ?
       WHERE category = 'Transactional'`,
    )
    .run(renamedAt)

  const rawColors = await getSetting('tag_colors')
  if (rawColors) {
    try {
      const colors = JSON.parse(rawColors) as Record<string, Record<string, string>>
      const bucket = colors.category || {}
      let changed = false
      if ('Yearly' in bucket) {
        if (bucket.Goal == null) bucket.Goal = bucket.Yearly
        delete bucket.Yearly
        changed = true
      }
      if ('Transactional' in bucket) {
        if (bucket.Projects == null) bucket.Projects = bucket.Transactional
        delete bucket.Transactional
        changed = true
      }
      if (changed) {
        colors.category = bucket
        await setSetting('tag_colors', JSON.stringify(colors))
      }
    } catch {
      /* ignore */
    }
  }

  const rawLists = await getSetting('tag_lists')
  if (rawLists) {
    try {
      const lists = JSON.parse(rawLists) as { category?: string[]; project?: string[] }
      if (Array.isArray(lists.category)) {
        lists.category = lists.category.map((v) => {
          if (v === 'Yearly') return 'Goal'
          if (v === 'Transactional') return 'Projects'
          return v
        })
        await setSetting('tag_lists', JSON.stringify(lists))
      }
    } catch {
      /* ignore */
    }
  }

  await backfillCadenceDefaults()
  await ensureDefaultColumns()
  await backfillColumnRoles()
  await backfillTaskColumns()
  await backfillBoardSort()
}

async function backfillCadenceDefaults() {
  await db
    .prepare(
      `UPDATE tasks SET cadence_weekday = 5
       WHERE category = 'Weekly' AND cadence_weekday IS NULL`,
    )
    .run()
  await db
    .prepare(
      `UPDATE tasks SET cadence_month_day = 1
       WHERE category = 'Monthly' AND cadence_month_day IS NULL`,
    )
    .run()
  await db
    .prepare(
      `UPDATE tasks SET cadence_weekday = NULL, cadence_month_day = NULL
       WHERE category NOT IN ('Weekly', 'Monthly')
         AND (cadence_weekday IS NOT NULL OR cadence_month_day IS NOT NULL)`,
    )
    .run()
}

async function ensureDefaultColumns() {
  const count = (await db.prepare('SELECT COUNT(*) AS c FROM board_columns').get()) as
    | { c: number }
    | undefined
  if (Number(count?.c) > 0) return

  const now = new Date().toISOString()
  const insert = db.prepare(`
    INSERT INTO board_columns (id, name, position, color, is_terminal, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  await insert.run(randomUUID(), 'Backlog', 0, '#66758c', 0, 'backlog', now, now)
  await insert.run(randomUUID(), 'In Progress', 1, '#2b63e3', 0, 'doing', now, now)
  await insert.run(randomUUID(), 'Done', 2, '#14965c', 1, 'done', now, now)
}

async function backfillColumnRoles() {
  const columns = (await db
    .prepare('SELECT id, name, is_terminal, role FROM board_columns')
    .all()) as Array<{ id: string; name: string; is_terminal: number; role: string }>

  const update = db.prepare(
    `UPDATE board_columns SET role = ?, is_terminal = ? WHERE id = ?`,
  )
  for (const col of columns) {
    if (col.role && col.role !== 'custom') continue
    const inferred = inferRoleFromName(col.name, Boolean(col.is_terminal))
    if (inferred === 'custom' && col.role === 'custom') continue
    const role = col.role !== 'custom' ? col.role : inferred
    const terminal = role === 'done' ? 1 : col.is_terminal
    if (role !== col.role || terminal !== col.is_terminal) {
      await update.run(role, terminal, col.id)
    }
  }

  const roles = (await db
    .prepare('SELECT id, role, position FROM board_columns ORDER BY position ASC')
    .all()) as Array<{ id: string; role: string; position: number }>
  if (roles.length === 0) return

  const has = (r: string) => roles.some((c) => c.role === r)
  if (!has('backlog')) {
    await update.run('backlog', 0, roles[0].id)
    roles[0].role = 'backlog'
  }
  if (!has('doing')) {
    const candidate =
      roles.find((c) => c.role === 'custom') || roles.find((c) => c.role !== 'done') || roles[0]
    await update.run('doing', 0, candidate.id)
    candidate.role = 'doing'
  }
  if (!has('done')) {
    const candidate = roles.find((c) => c.role === 'custom') || roles[roles.length - 1]
    await update.run('done', 1, candidate.id)
  }
}

async function backfillTaskColumns() {
  const columns = (await db
    .prepare('SELECT id, role FROM board_columns ORDER BY position ASC')
    .all()) as Array<{ id: string; role: string }>
  if (columns.length === 0) return

  const backlog = columns.find((c) => c.role === 'backlog')?.id || columns[0].id
  const doing = columns.find((c) => c.role === 'doing')?.id || backlog
  const done = columns.find((c) => c.role === 'done')?.id || columns[columns.length - 1].id

  const tasks = (await db
    .prepare('SELECT id, status, column_id FROM tasks')
    .all()) as Array<{ id: string; status: string; column_id: string | null }>

  const update = db.prepare(
    `UPDATE tasks SET column_id = ?, sort_order = COALESCE(sort_order, 0), updated_at = ? WHERE id = ?`,
  )
  const now = new Date().toISOString()
  const tx = db.transaction(async () => {
    let order = 0
    for (const task of tasks) {
      if (task.column_id) continue
      const col =
        task.status === 'done' ? done : task.status === 'doing' ? doing : backlog
      await update.run(col, now, task.id)
      order += 1
      await db.prepare(`UPDATE tasks SET sort_order = ? WHERE id = ?`).run(order, task.id)
    }
  })
  await tx()
}

async function backfillBoardSort() {
  const missing = (await db
    .prepare(
      `SELECT COUNT(*) AS c FROM tasks WHERE board_sort IS NULL OR (board_sort = 0 AND sort_order != 0)`,
    )
    .get()) as { c: number }

  const tasks = (await db
    .prepare('SELECT id, sort_order, board_sort, column_id FROM tasks')
    .all()) as Array<{
    id: string
    sort_order: number
    board_sort: number
    column_id: string | null
  }>

  const byColumn = new Map<string, typeof tasks>()
  for (const t of tasks) {
    const key = t.column_id || '__none__'
    if (!byColumn.has(key)) byColumn.set(key, [])
    byColumn.get(key)!.push(t)
  }

  const upd = db.prepare(`UPDATE tasks SET board_sort = ? WHERE id = ?`)
  const tx = db.transaction(async () => {
    for (const [, list] of byColumn) {
      const allZero = list.every((t) => Number(t.board_sort) === 0)
      if (!allZero && Number(missing.c) === 0) continue
      const sorted = list
        .slice()
        .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      for (const [index, t] of sorted.entries()) {
        if (Number(t.board_sort) === 0) await upd.run(index, t.id)
      }
    }
  })
  await tx()
}

export async function getColumnByRole(role: ColumnRole): Promise<string | null> {
  const row = (await db
    .prepare(
      `SELECT id FROM board_columns WHERE role = ? ORDER BY position ASC LIMIT 1`,
    )
    .get(role)) as { id: string } | undefined
  return row?.id ?? null
}

export async function getBacklogColumnId(): Promise<string> {
  return (
    (await getColumnByRole('backlog')) ||
    (
      (await db
        .prepare(`SELECT id FROM board_columns ORDER BY position ASC LIMIT 1`)
        .get()) as { id: string }
    ).id
  )
}

export async function getDoingColumnId(): Promise<string> {
  return (await getColumnByRole('doing')) ?? (await getBacklogColumnId())
}

export async function getTerminalColumnId(): Promise<string | null> {
  return getColumnByRole('done')
}

export async function getColumnRole(columnId: string | null): Promise<ColumnRole> {
  if (!columnId) return 'backlog'
  const row = (await db
    .prepare(`SELECT role, is_terminal FROM board_columns WHERE id = ?`)
    .get(columnId)) as { role: string; is_terminal: number } | undefined
  if (!row) return 'custom'
  if (row.role === 'backlog' || row.role === 'doing' || row.role === 'done' || row.role === 'custom') {
    return row.role
  }
  return row.is_terminal ? 'done' : 'custom'
}

export async function statusForColumn(
  columnId: string | null,
): Promise<'todo' | 'doing' | 'done'> {
  const role = await getColumnRole(columnId)
  if (role === 'done') return 'done'
  if (role === 'doing') return 'doing'
  return 'todo'
}

export async function assignUniqueRole(
  columnId: string,
  role: ColumnRole,
  now: string,
) {
  if (role === 'custom') {
    await db
      .prepare(
        `UPDATE board_columns SET role = 'custom', is_terminal = 0, updated_at = ? WHERE id = ?`,
      )
      .run(now, columnId)
    return
  }
  await db
    .prepare(
      `UPDATE board_columns SET role = 'custom', is_terminal = 0, updated_at = ? WHERE role = ? AND id != ?`,
    )
    .run(now, role, columnId)
  await db
    .prepare(
      `UPDATE board_columns SET role = ?, is_terminal = ?, updated_at = ? WHERE id = ?`,
    )
    .run(role, role === 'done' ? 1 : 0, now, columnId)
}

export function parseColumnRole(value: unknown): ColumnRole | null {
  if (value === 'backlog' || value === 'doing' || value === 'done' || value === 'custom') {
    return value
  }
  return null
}

export async function getSetting(key: string): Promise<string | null> {
  const row = (await db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const key of keys) out[key] = null
  if (keys.length === 0) return out
  const placeholders = keys.map(() => '?').join(',')
  const rows = (await db
    .prepare(`SELECT key, value FROM app_settings WHERE key IN (${placeholders})`)
    .all(...keys)) as Array<{ key: string; value: string }>
  for (const row of rows) out[String(row.key)] = row.value ?? null
  return out
}

export async function setSetting(key: string, value: string) {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, now)
}

export type ListSortField = 'manual' | 'category' | 'project' | 'priority'
export type ListSortDir = 'asc' | 'desc'

export type ListSort = {
  field: ListSortField
  dir: ListSortDir
}

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const CATEGORY_RANK = [
  'Daily',
  'Weekly',
  'Monthly',
  'Quarterly',
  'Goal',
  'Projects',
]

export function defaultListSort(): ListSort {
  return { field: 'manual', dir: 'asc' }
}

export function parseListSort(raw: string | null): ListSort {
  if (!raw) return defaultListSort()
  try {
    const parsed = JSON.parse(raw) as Partial<ListSort>
    const field = parsed.field
    const dir = parsed.dir === 'desc' ? 'desc' : 'asc'
    if (
      field === 'manual' ||
      field === 'category' ||
      field === 'project' ||
      field === 'priority'
    ) {
      return { field, dir }
    }
  } catch {
    /* ignore */
  }
  return defaultListSort()
}

export function compareTasksForSort(
  a: { category: string; project_tag: string; priority: string; sort_order: number },
  b: { category: string; project_tag: string; priority: string; sort_order: number },
  sort: ListSort,
): number {
  if (sort.field === 'manual') {
    return Number(a.sort_order) - Number(b.sort_order)
  }
  let cmp = 0
  if (sort.field === 'priority') {
    cmp = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)
  } else if (sort.field === 'project') {
    cmp = String(a.project_tag).localeCompare(String(b.project_tag), undefined, {
      sensitivity: 'base',
    })
  } else if (sort.field === 'category') {
    const ai = CATEGORY_RANK.indexOf(a.category)
    const bi = CATEGORY_RANK.indexOf(b.category)
    cmp =
      (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) ||
      String(a.category).localeCompare(String(b.category), undefined, {
        sensitivity: 'base',
      })
  }
  if (cmp === 0) cmp = Number(a.sort_order) - Number(b.sort_order)
  return sort.dir === 'desc' ? -cmp : cmp
}

export async function applyListSort(sort: ListSort): Promise<string[]> {
  const rows = (await db
    .prepare(
      `SELECT id, category, project_tag, priority, sort_order FROM tasks WHERE is_master = 1`,
    )
    .all()) as Array<{
    id: string
    category: string
    project_tag: string
    priority: string
    sort_order: number
  }>

  if (sort.field !== 'manual') {
    rows.sort((a, b) => compareTasksForSort(a, b, sort))
  } else {
    rows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
  }

  const now = new Date().toISOString()
  const update = db.prepare(
    `UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?`,
  )
  const tx = db.transaction(async () => {
    for (const [index, row] of rows.entries()) {
      await update.run(index, now, row.id)
    }
    await setSetting('list_sort', JSON.stringify(sort))
  })
  await tx()
  return rows.map((r) => r.id)
}
