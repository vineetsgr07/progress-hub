import type {
  AnalyticsPage,
  Board,
  BoardColumn,
  Category,
  DateSummary,
  Habit,
  HabitsProgress,
  HabitsResponse,
  Mindmap,
  MindmapDocument,
  MindmapListItem,
  Priority,
  ProgressRange,
  ProgressSeries,
  Stats,
  Subtask,
  Task,
  TimeLog,
  NowPage,
  Reminder,
  TodayPage,
  TodayPulse,
  WeekProgress,
} from './types'
import type { TagColorMap, TagLists } from './features/tags'
import { getSupabase } from './supabase'

export type ListSortField = 'manual' | 'category' | 'project' | 'priority'
export type ListSortDir = 'asc' | 'desc'
export type ListSort = { field: ListSortField; dir: ListSortDir }

export type AppSettings = {
  listSort: ListSort
  tagColors: TagColorMap | null
  tagLists: TagLists | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) || {}),
  }
  const supabase = getSupabase()
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(path, {
    ...init,
    headers,
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_REQUIRED')
    if (res.status === 403) throw new Error('AUTH_FORBIDDEN')
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  getTasks(date: string, opts?: { category?: Category; master?: boolean }) {
    const params = new URLSearchParams({ date })
    if (opts?.category && opts.category !== 'All') params.set('category', opts.category)
    if (opts?.master) params.set('master', '1')
    return request<{ date: string; tasks: Task[] }>(`/api/tasks?${params}`)
  },

  createTask(input: {
    title: string
    notes?: string
    category?: Exclude<Category, 'All'>
    projectTag?: string
    priority?: Priority
    status?: 'todo' | 'doing' | 'done'
    addToToday?: boolean
    date?: string
    columnId?: string
    subtasks?: string[]
    cadenceWeekday?: number | null
    cadenceMonthDay?: number | null
  }) {
    return request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  updateTask(
    id: string,
    input: Partial<{
      title: string
      notes: string
      category: Exclude<Category, 'All'>
      projectTag: string
      priority: Priority
      status: 'todo' | 'doing' | 'done'
      columnId: string
      date: string
      cadenceWeekday: number | null
      cadenceMonthDay: number | null
    }>,
  ) {
    return request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  deleteTask(id: string) {
    return request<void>(`/api/tasks/${id}`, { method: 'DELETE' })
  },

  reorderTasks(orderedIds: string[]) {
    return request<{ ok: boolean; count: number; listSort: ListSort }>(
      '/api/tasks/reorder',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      },
    )
  },

  sortTasks(field: ListSortField, dir: ListSortDir = 'asc') {
    return request<{ ok: boolean; orderedIds: string[]; listSort: ListSort }>(
      '/api/tasks/sort',
      {
        method: 'PATCH',
        body: JSON.stringify({ field, dir }),
      },
    )
  },

  getToday(
    date: string,
    opts?: { category?: Category; master?: boolean },
  ) {
    const params = new URLSearchParams({ date })
    if (opts?.category && opts.category !== 'All') params.set('category', opts.category)
    if (opts?.master) params.set('master', '1')
    return request<TodayPage>(`/api/today?${params}`)
  },

  getTodayPulse(date: string) {
    return request<TodayPulse>(
      `/api/today/pulse?date=${encodeURIComponent(date)}`,
    )
  },

  getAnalytics(date: string) {
    return request<AnalyticsPage>(
      `/api/analytics?date=${encodeURIComponent(date)}`,
    )
  },

  getSettings() {
    return request<AppSettings>('/api/settings')
  },

  patchSettings(input: {
    tagColors?: TagColorMap
    tagLists?: TagLists
    listSort?: ListSort
  }) {
    return request<AppSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  renameTag(input: {
    kind: 'category' | 'project'
    from: string
    to: string
  }) {
    return request<AppSettings & { ok: boolean; updated: number }>(
      '/api/tags/rename',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },

  scheduleTask(id: string, date: string) {
    return request<Task>(`/api/tasks/${id}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ date }),
    })
  },

  addSubtask(taskId: string, title: string) {
    return request<Subtask>(`/api/tasks/${taskId}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  },

  reorderSubtasks(taskId: string, orderedIds: string[]) {
    return request<{ ok: boolean; count: number }>(
      `/api/tasks/${taskId}/subtasks/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      },
    )
  },

  updateSubtask(
    id: string,
    input: Partial<{
      title: string
      done: boolean
      position: number
      date: string
      pinned: boolean
    }>,
  ) {
    return request<Subtask>(`/api/subtasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  getNow(date: string) {
    return request<NowPage>(`/api/now?date=${encodeURIComponent(date)}`)
  },

  reorderNowItems(orderedIds: string[]) {
    return request<{ ok: boolean; count: number }>('/api/now/items/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    })
  },

  getReminders() {
    return request<{ date: string; reminders: Reminder[] }>('/api/reminders')
  },

  createReminder(input: {
    title: string
    dueDate?: string
    dueTime?: string | null
  }) {
    return request<Reminder>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  updateReminder(
    id: string,
    input: Partial<{
      title: string
      dueDate: string
      dueTime: string | null
      done: boolean
    }>,
  ) {
    return request<Reminder>(`/api/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  deleteReminder(id: string) {
    return request<void>(`/api/reminders/${id}`, { method: 'DELETE' })
  },

  reorderReminders(orderedIds: string[]) {
    return request<{ ok: boolean; count: number }>('/api/reminders/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    })
  },

  deleteSubtask(id: string) {
    return request<void>(`/api/subtasks/${id}`, { method: 'DELETE' })
  },

  getBoard() {
    return request<Board>('/api/board')
  },

  createColumn(input: {
    name: string
    color?: string
    isTerminal?: boolean
    role?: 'backlog' | 'doing' | 'done' | 'custom'
  }) {
    return request<BoardColumn>('/api/board/columns', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  updateColumn(
    id: string,
    input: Partial<{
      name: string
      color: string
      position: number
      isTerminal: boolean
      role: 'backlog' | 'doing' | 'done' | 'custom'
    }>,
  ) {
    return request<BoardColumn>(`/api/board/columns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  deleteColumn(id: string) {
    return request<void>(`/api/board/columns/${id}`, { method: 'DELETE' })
  },

  reorderColumns(orderedIds: string[]) {
    return request<{ columns: BoardColumn[] }>('/api/board/columns/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    })
  },

  moveTask(input: {
    taskId: string
    columnId: string
    sortOrder?: number
    orderedTaskIds?: string[]
    date?: string
  }) {
    return request<Task>('/api/board/move', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  patchDayEntry(
    taskId: string,
    input: {
      date?: string
      completed?: boolean
      hours?: number
      timerAction?: 'start' | 'stop'
      subtaskId?: string | null
    },
  ) {
    return request<Task>(`/api/day-entries/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  getGoal(date: string) {
    return request<{ date: string; goal: string }>(`/api/goal?date=${date}`)
  },

  setGoal(date: string, goal: string) {
    return request<{ date: string; goal: string }>('/api/goal', {
      method: 'PUT',
      body: JSON.stringify({ date, goal }),
    })
  },

  getStats(date: string, opts?: { insight?: boolean }) {
    const params = new URLSearchParams({ date })
    if (opts?.insight) params.set('insight', '1')
    return request<Stats>(`/api/stats?${params}`)
  },

  getProgress(date: string, range: ProgressRange) {
    return request<ProgressSeries>(
      `/api/stats/progress?date=${encodeURIComponent(date)}&range=${range}`,
    )
  },

  getWeekProgress(date: string) {
    return request<WeekProgress>(
      `/api/stats/week?date=${encodeURIComponent(date)}`,
    )
  },

  getHistory(limit = 50) {
    return request<{ logs: TimeLog[] }>(`/api/history?limit=${limit}`)
  },

  patchHistoryLog(id: string, input: { hours: number }) {
    return request<TimeLog>(`/api/history/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  getDates() {
    return request<{ dates: DateSummary[] }>('/api/dates')
  },

  exportAll() {
    return request<Record<string, unknown>>('/api/export')
  },

  importAll(payload: Record<string, unknown>) {
    return request<{
      ok: boolean
      counts: {
        tasks: number
        boardColumns: number
        subtasks: number
        dayEntries: number
        notes?: number
      }
    }>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getNotes(opts?: {
    q?: string
    project?: string
    priority?: string
    source?: 'all' | 'task' | 'note'
    sort?: 'updated' | 'priority' | 'project' | 'manual'
    /** recent = last 14 days; older = before that; all = no recency filter. */
    scope?: 'recent' | 'older' | 'all'
    limit?: number
    pinned?: boolean
  }) {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.project) params.set('project', opts.project)
    if (opts?.priority) params.set('priority', opts.priority)
    if (opts?.source && opts.source !== 'all') params.set('source', opts.source)
    if (opts?.sort) params.set('sort', opts.sort)
    if (opts?.scope) params.set('scope', opts.scope)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.pinned) params.set('pinned', '1')
    const qs = params.toString()
    return request<{
      notes: import('./features/notes-list').NoteListItem[]
      olderCount: number
    }>(`/api/notes${qs ? `?${qs}` : ''}`)
  },

  getNote(source: 'task' | 'note', id: string) {
    return request<import('./features/notes-list').NoteDetail>(
      `/api/notes/${source}/${id}`,
    )
  },

  createNote(input: {
    title?: string
    body?: string
    projectTag?: string
    priority?: Priority
    pinned?: boolean
  }) {
    return request<import('./features/notes-list').NoteDetail>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  reorderNotes(orderedKeys: string[]) {
    return request<{ ok: boolean; count: number; orderedKeys: string[] }>(
      '/api/notes/reorder',
      {
        method: 'PATCH',
        body: JSON.stringify({ orderedKeys }),
      },
    )
  },

  updateNote(
    id: string,
    input: Partial<{
      title: string
      body: string
      projectTag: string
      priority: Priority
      pinned: boolean
    }>,
  ) {
    return request<import('./features/notes-list').NoteDetail>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  deleteNote(id: string) {
    return request<void>(`/api/notes/${id}`, { method: 'DELETE' })
  },

  clearTaskNotes(taskId: string) {
    return request<void>(`/api/notes/task/${taskId}/clear`, { method: 'POST' })
  },

  getHabits(date: string) {
    return request<HabitsResponse>(
      `/api/habits?date=${encodeURIComponent(date)}`,
    )
  },

  getHabitsProgress(days = 28) {
    return request<HabitsProgress>(
      `/api/habits/progress?days=${encodeURIComponent(String(days))}`,
    )
  },

  createHabit(title: string) {
    return request<Habit>('/api/habits', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  },

  reorderHabits(orderedIds: string[]) {
    return request<{ ok: boolean; count: number }>('/api/habits/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    })
  },

  updateHabit(
    id: string,
    input: Partial<{ title: string; sortOrder: number; archived: boolean }>,
  ) {
    return request<Habit>(`/api/habits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  deleteHabit(id: string) {
    return request<void>(`/api/habits/${id}`, { method: 'DELETE' })
  },

  setHabitEntry(id: string, date: string, completed: boolean) {
    return request<Habit>(`/api/habits/${id}/entry`, {
      method: 'PUT',
      body: JSON.stringify({ date, completed }),
    })
  },

  getMindmaps() {
    return request<{ mindmaps: MindmapListItem[] }>('/api/mindmaps')
  },

  getMindmap(id: string) {
    return request<Mindmap>(`/api/mindmaps/${id}`)
  },

  createMindmap(input?: { title?: string; document?: MindmapDocument }) {
    return request<Mindmap>('/api/mindmaps', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    })
  },

  updateMindmap(
    id: string,
    input: Partial<{
      title: string
      document: MindmapDocument
      sortOrder: number
    }>,
  ) {
    return request<Mindmap>(`/api/mindmaps/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  },

  deleteMindmap(id: string) {
    return request<void>(`/api/mindmaps/${id}`, { method: 'DELETE' })
  },
}
