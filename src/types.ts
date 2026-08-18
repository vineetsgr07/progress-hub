export type Category =
  | 'All'
  | 'Daily'
  | 'Weekly'
  | 'Monthly'
  | 'Quarterly'
  | 'Goal'
  | 'Projects'
  | (string & {})

export type Priority = 'High' | 'Medium' | 'Low'

export type ViewTab =
  | 'now'
  | 'today'
  | 'dates'
  | 'analytics'
  | 'master'
  | 'history'
  | 'board'
  | 'notes'
  | 'habits'
  | 'maps'

export type ColumnRole = 'backlog' | 'doing' | 'done' | 'custom'

export type DayEntry = {
  id: string
  date: string
  completed: boolean
  hours: number
  timerStartedAt: string | null
  /** Checklist item owning the running timer; null = task-level. */
  timerSubtaskId: string | null
  notes: string
}

export type Subtask = {
  id: string
  taskId: string
  title: string
  done: boolean
  position: number
  pinned: boolean
  /** Now-page order among pinned items. Independent of checklist `position`. */
  pinSort: number
  /** Hours attributed to this checklist item for the loaded date. */
  hours: number
  createdAt: string
  updatedAt: string
}

export type Reminder = {
  id: string
  title: string
  dueDate: string
  dueTime: string | null
  done: boolean
  position: number
  createdAt: string
  updatedAt: string
}

export type BoardColumn = {
  id: string
  name: string
  position: number
  color: string
  role: ColumnRole
  isTerminal: boolean
  createdAt: string
  updatedAt: string
}

export type Task = {
  id: string
  title: string
  notes: string
  category: string
  projectTag: string
  priority: Priority
  status: 'todo' | 'doing' | 'done'
  columnId: string | null
  sortOrder: number
  boardSort: number
  isMaster: boolean
  /** Weekly: 0=Sun…6=Sat. Null for non-Weekly. */
  cadenceWeekday: number | null
  /** Monthly: 1–28. Null for non-Monthly. */
  cadenceMonthDay: number | null
  createdAt: string
  updatedAt: string
  subtasks: Subtask[]
  subtaskProgress: { done: number; total: number }
  entry: DayEntry | null
}

export type PinnedChecklistItem = Subtask & {
  taskTitle: string
  task: Task
  timerStartedAt: string | null
  timerSubtaskId: string | null
}

export type NowPage = {
  date: string
  items: PinnedChecklistItem[]
  reminders: Reminder[]
  habits: Habit[]
}

export type Board = {
  columns: BoardColumn[]
  tasks: Task[]
}

export type Stats = {
  date: string
  today: {
    completed: number
    total: number
    remaining: number
    hours: number
    percent: number
    checklistDone: number
    checklistTotal: number
    checklistPercent: number
  }
  streak: number
  history: Array<{
    date: string
    completed: number
    total: number
    hours: number
  }>
  byCategory: Array<{
    category: string
    count: number
    done: number
    hours: number
    sharePercent?: number
    priorHours?: number
  }>
  byProject: Array<{
    projectTag: string
    count: number
    done: number
    hours: number
    sharePercent?: number
    priorHours?: number
  }>
  sessions: TimeSession[]
  insight?: {
    rangeStart: string
    rangeEnd: string
    unfinishedDaily: Array<{
      taskId: string
      title: string
      todayHours: number
      totalHours: number
      priorIncompleteDays: number
    }>
    unfinishedDailyTotalHours: number
    goals: {
      workTargetHours: number
      habitBudgetHours: number
      totalTargetHours: number
    }
    todayBudget: BudgetDayPoint
    budgetSeries: BudgetDayPoint[]
  }
}

export type BudgetDayPoint = {
  date: string
  label: string
  workHours: number
  workTarget: number
  habitBudgetHours: number
  habitTarget: number
  habitCompleted: number
  habitTotal: number
  totalHours: number
  totalTarget: number
  workPercent: number
  habitPercent: number
  totalPercent: number
}

export type TimeSession = {
  id: string
  taskId: string
  title: string
  projectTag: string
  priority: string
  subtaskId: string | null
  subtaskTitle: string | null
  hours: number
  createdAt: string
  running: boolean
}

export type ProgressRange = 'day' | 'week' | 'month'

export type ProgressPoint = {
  key: string
  label: string
  completed: number
  total: number
  hours: number
  percent: number
}

export type ProgressSeries = {
  date: string
  range: ProgressRange
  series: ProgressPoint[]
}

export type WeekDayPoint = {
  date: string
  label: string
  dayOfMonth: number
  completed: number
  total: number
  percent: number
  hours: number
  isToday: boolean
  isFuture: boolean
  /** Day goal saved for this calendar date (empty if none). */
  goal: string
}

export type WeekProgress = {
  date: string
  weekStart: string
  weekEnd: string
  days: WeekDayPoint[]
  summary: {
    completed: number
    total: number
    percent: number
    hours: number
    activeDays: number
    bestDate: string | null
  }
  previous: {
    completed: number
    total: number
    percent: number
  }
  streak: number
}

export type TimeLog = {
  id: string
  taskId: string
  title: string
  category: string
  projectTag: string
  priority: string
  date: string
  hours: number
  note: string
  createdAt: string
  subtaskId: string | null
  subtaskTitle: string | null
}

export type DateSummary = {
  date: string
  total: number
  completed: number
  hours: number
}

export type Habit = {
  id: string
  title: string
  sortOrder: number
  archived: boolean
  createdAt: string
  updatedAt: string
  /** Check-in for the requested date. */
  completed: boolean
}

export type HabitsResponse = {
  date: string
  habits: Habit[]
  summary: { completed: number; total: number }
}

export type HabitDayCell = {
  date: string
  completed: boolean
  tracked: boolean
}

export type HabitProgressRow = {
  id: string
  title: string
  archived: boolean
  createdAt: string
  completedDays: number
  trackedDays: number
  percent: number
  streak: number
  cells: HabitDayCell[]
}

export type HabitsDailySummary = {
  date: string
  completed: number
  total: number
  percent: number
}

export type HabitsProgress = {
  startDate: string
  endDate: string
  days: number
  habits: HabitProgressRow[]
  daily: HabitsDailySummary[]
}

/** React Flow serializable mindmap document. */
export type MindmapDocument = {
  nodes: unknown[]
  edges: unknown[]
  viewport?: unknown
}

export type MindmapListItem = {
  id: string
  title: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type Mindmap = MindmapListItem & {
  document: MindmapDocument
}

export type NotesListPayload = {
  notes: import('./features/notes-list').NoteListItem[]
  olderCount: number
}

export type TodayPage = {
  date: string
  tasks: Task[]
  stats: Stats
  habits?: HabitsResponse
  week?: WeekProgress
}

export type TodayPulse = {
  stats: Stats
  week: WeekProgress
}

export type AnalyticsPage = {
  date: string
  stats: Stats
  habitsProgress: HabitsProgress
}
