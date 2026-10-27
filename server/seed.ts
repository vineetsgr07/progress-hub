import { randomUUID } from 'node:crypto'
import { db, getBacklogColumnId } from './db.js'

type SeedTask = {
  title: string
  notes: string
  category: string
  project_tag: string
  priority: string
  subtasks: string[]
}

/** Checklist items to attach to existing tasks by title (none by default). */
export const SHEET_SUBTASKS_BY_TITLE: Record<string, string[]> = {}

/** Made-up sample tasks for a fresh database. */
const SEED_TASKS: SeedTask[] = [
  {
    title: 'Write the weekly blog post',
    notes: '',
    category: 'Daily',
    project_tag: 'Marketing',
    priority: 'Medium',
    subtasks: ['Outline three key points', 'Draft 500 words'],
  },
  {
    title: 'Share one tip on social media',
    notes: '',
    category: 'Daily',
    project_tag: 'Marketing',
    priority: 'Low',
    subtasks: [],
  },
  {
    title: 'Ship one small feature',
    notes: '',
    category: 'Daily',
    project_tag: 'Development',
    priority: 'High',
    subtasks: ['Write the test first', 'Open a pull request'],
  },
  {
    title: 'Fix the top open bug',
    notes: '',
    category: 'Daily',
    project_tag: 'Development',
    priority: 'High',
    subtasks: [],
  },
  {
    title: 'Morning workout',
    notes: '20 minutes is enough',
    category: 'Daily',
    project_tag: 'Personal',
    priority: 'Medium',
    subtasks: ['Stretch', 'Run or walk'],
  },
  {
    title: 'Release build to testers',
    notes: '',
    category: 'Weekly',
    project_tag: 'Development',
    priority: 'High',
    subtasks: ['Bump the version', 'Write release notes'],
  },
  {
    title: 'Plan next week',
    notes: 'Pick the top three goals',
    category: 'Weekly',
    project_tag: 'Management',
    priority: 'Medium',
    subtasks: [],
  },
  {
    title: 'Review goals vs shipped',
    notes: 'Weekly look back',
    category: 'Weekly',
    project_tag: 'Management',
    priority: 'Medium',
    subtasks: [],
  },
  {
    title: 'Grocery run',
    notes: '',
    category: 'Weekly',
    project_tag: 'Personal',
    priority: 'Low',
    subtasks: [],
  },
  {
    title: 'Renew library card',
    notes: '',
    category: 'Projects',
    project_tag: 'Admin/Legal',
    priority: 'Medium',
    subtasks: ['Find the renewal form', 'Visit the branch'],
  },
  {
    title: 'Learn TypeScript generics',
    notes: '',
    category: 'Projects',
    project_tag: 'Personal',
    priority: 'Low',
    subtasks: [],
  },
  {
    title: 'Monthly metrics review',
    notes: 'Look at the trends, pick one fix',
    category: 'Monthly',
    project_tag: 'Management',
    priority: 'Medium',
    subtasks: [],
  },
]

async function insertSubtasks(taskId: string, titles: string[]) {
  const now = new Date().toISOString()
  const insert = await db.prepare(`
    INSERT INTO subtasks (id, task_id, title, done, position, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `)
  for (const [index, title] of titles.entries()) {
    await insert.run(randomUUID(), taskId, title, index, now, now)
  }
}

export async function seedIfEmpty() {
  const count = await db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }
  if (count.c > 0) return

  const now = new Date().toISOString()
  const backlog = await getBacklogColumnId()
  const insert = await db.prepare(`
    INSERT INTO tasks (
      id, title, notes, category, project_tag, priority, status, is_master,
      column_id, sort_order, board_sort, cadence_weekday, cadence_month_day,
      created_at, updated_at
    )
    VALUES (@id, @title, @notes, @category, @project_tag, @priority, 'todo', 1,
      @column_id, @sort_order, @board_sort, @cadence_weekday, @cadence_month_day,
      @now, @now)
  `)

  const tx = db.transaction(async () => {
    for (const [index, task] of SEED_TASKS.entries()) {
      const id = randomUUID()
      const cadenceWeekday = task.category === 'Weekly' ? 5 : null
      const cadenceMonthDay = task.category === 'Monthly' ? 1 : null
      await insert.run({
        id,
        title: task.title,
        notes: task.notes,
        category: task.category,
        project_tag: task.project_tag,
        priority: task.priority,
        column_id: backlog,
        sort_order: index,
        board_sort: index,
        cadence_weekday: cadenceWeekday,
        cadence_month_day: cadenceMonthDay,
        now,
      })
      if (task.subtasks.length) await insertSubtasks(id, task.subtasks)
    }
  })
  await tx()
}

/** For existing DBs: attach sheet checklists when a matching task has none. */
export async function reconcileSheetSubtasks() {
  const tasks = await db.prepare('SELECT id, title FROM tasks').all() as Array<{
    id: string
    title: string
  }>
  const countStmt = await db.prepare(
    'SELECT COUNT(*) AS c FROM subtasks WHERE task_id = ?',
  )
  const tx = db.transaction(async () => {
    for (const task of tasks) {
      const count = await countStmt.get(task.id) as { c: number }
      if (count.c > 0) continue

      const exact = SHEET_SUBTASKS_BY_TITLE[task.title]
      if (exact?.length) {
        await insertSubtasks(task.id, exact)
        continue
      }

      // Fuzzy: influencer title variants
      const key = Object.keys(SHEET_SUBTASKS_BY_TITLE).find(
        (k) =>
          task.title.toLowerCase().includes(k.toLowerCase().slice(0, 24)) ||
          k.toLowerCase().includes(task.title.toLowerCase().slice(0, 24)),
      )
      if (key && SHEET_SUBTASKS_BY_TITLE[key]?.length) {
        await insertSubtasks(task.id, SHEET_SUBTASKS_BY_TITLE[key])
      }
    }
  })
  await tx()
}
