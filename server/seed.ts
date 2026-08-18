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

/** Checklist items from Daily Tracker Notes / Details. */
export const SHEET_SUBTASKS_BY_TITLE: Record<string, string[]> = {
  'UGC marketing': [
    'Investigate how to create a UGC ADD, so is there any already existing API which I can use to build a UGC at a lower cost? Can i do a post today.',
  ],
  SEO: [
    'How to be best in SEO in age of AI era, make some research and do a post today.',
  ],
  'Instagram/TikTok automation progress': [
    'Simple automation to post a reel everyday on digital platform, bare minimum automation. Could be manual though.',
  ],
  'Client work and progress': [
    'Review logs and latency and find the root cause',
  ],
  'Feature development': [
    'Complete Device Preview for the Software Engineer APP. Feature for software agent.',
  ],
  'Application deployment': [
    'Improve ASO',
    'Make a IOS build and do the deployment',
  ],
  'Update ID documents': [
    'Fill in the online form.',
    'sample-reference',
  ],
  'Influencer marketing - post a reel or daily article on LinkedIn': [
    'Think a simple tech innovation happening in market and post content on x.com',
  ],
  'Influencer marketing - post a reel or daily article; it can also be added to your story': [
    'Think a simple tech innovation happening in market and post content on x.com',
  ],
}

const SEED_TASKS: SeedTask[] = [
  {
    title: 'UGC marketing',
    notes: '',
    category: 'Daily',
    project_tag: 'Marketing',
    priority: 'Medium',
    subtasks: SHEET_SUBTASKS_BY_TITLE['UGC marketing'],
  },
  {
    title: 'SEO',
    notes: '',
    category: 'Daily',
    project_tag: 'Marketing',
    priority: 'Medium',
    subtasks: SHEET_SUBTASKS_BY_TITLE.SEO,
  },
  {
    title: 'Influencer marketing - post a reel or daily article on LinkedIn',
    notes: '',
    category: 'Daily',
    project_tag: 'Marketing',
    priority: 'Medium',
    subtasks:
      SHEET_SUBTASKS_BY_TITLE[
        'Influencer marketing - post a reel or daily article on LinkedIn'
      ],
  },
  {
    title: 'Instagram/TikTok automation progress',
    notes: '',
    category: 'Daily',
    project_tag: 'Marketing',
    priority: 'Medium',
    subtasks: SHEET_SUBTASKS_BY_TITLE['Instagram/TikTok automation progress'],
  },
  {
    title: 'Client work and progress',
    notes: '',
    category: 'Daily',
    project_tag: 'Work/Client',
    priority: 'High',
    subtasks: SHEET_SUBTASKS_BY_TITLE['Client work and progress'],
  },
  {
    title: 'Feature development',
    notes: '',
    category: 'Daily',
    project_tag: 'Development',
    priority: 'High',
    subtasks: SHEET_SUBTASKS_BY_TITLE['Feature development'],
  },
  {
    title: 'Application deployment',
    notes: '',
    category: 'Weekly',
    project_tag: 'Development',
    priority: 'High',
    subtasks: SHEET_SUBTASKS_BY_TITLE['Application deployment'],
  },
  {
    title: 'Planning',
    notes: 'Improve ASO + weekly roadmap',
    category: 'Weekly',
    project_tag: 'Management',
    priority: 'Medium',
    subtasks: [],
  },
  {
    title: 'Budget planning',
    notes: 'Review the month's spending',
    category: 'Weekly',
    project_tag: 'Personal',
    priority: 'Low',
    subtasks: [],
  },
  {
    title: "Capture analytics and plan the upcoming week's work accordingly",
    notes: '',
    category: 'Weekly',
    project_tag: 'Management',
    priority: 'Medium',
    subtasks: [],
  },
  {
    title: 'Renew library card',
    notes: '',
    category: 'Projects',
    project_tag: 'Admin/Legal',
    priority: 'High',
    subtasks: [],
  },
  {
    title: 'Review Plan',
    notes: 'Weekly review of goals vs shipped',
    category: 'Weekly',
    project_tag: 'Management',
    priority: 'Medium',
    subtasks: [],
  },
  {
    title: 'Update ID documents',
    notes: '',
    category: 'Projects',
    project_tag: 'Admin/Legal',
    priority: 'Medium',
    subtasks: SHEET_SUBTASKS_BY_TITLE['Update ID documents'],
  },
  {
    title: 'Monthly metrics review',
    notes: 'Funnel + retention check-in',
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
