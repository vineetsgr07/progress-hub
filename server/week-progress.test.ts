import './test-env.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-week-'))
process.env.TRACKER_DB_PATH = path.join(dir, 'test.db')
process.env.TRACKER_SKIP_SEED = '1'

const { migrate, db } = await import('./db.js')
const { buildWeekProgress } = await import('./day-progress.js')

await migrate()

async function insertTask(id: string, title: string, createdAt = '2026-08-01T00:00:00.000Z') {
  const now = createdAt
  await db.prepare(
    `INSERT INTO tasks (id, title, notes, category, project_tag, priority, status, is_master,
      created_at, updated_at, sort_order, board_sort)
     VALUES (?, ?, '', 'Daily', 'Work', 'Medium', 'todo', 1, ?, ?, 0, 0)`,
  ).run(id, title, now, now)
}

async function insertEntry(taskId: string, date: string, completed: number, hours = 0) {
  const now = `${date}T12:00:00.000Z`
  await db.prepare(
    `INSERT INTO day_entries (id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, '', ?, ?)`,
  ).run(`${taskId}-${date}`, taskId, date, completed, hours, now, now)
}

try {
  // Anchor Wednesday 2026-08-05 → week Mon 8/3 – Sun 8/9
  const anchor = '2026-08-05'
  await insertTask('t1', 'Task one')
  await insertTask('t2', 'Task two')

  // Mon: 1/2, Tue: 2/2, Wed: 0/2
  await insertEntry('t1', '2026-08-03', 1, 1)
  await insertEntry('t2', '2026-08-03', 0, 0)
  await insertEntry('t1', '2026-08-04', 1, 0.5)
  await insertEntry('t2', '2026-08-04', 1, 0.5)

  const week = await buildWeekProgress(anchor)

  assert.equal(week.weekStart, '2026-08-03')
  assert.equal(week.weekEnd, '2026-08-09')
  assert.equal(week.days.length, 7)
  assert.deepEqual(
    week.days.map((d) => d.label),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  )
  assert.deepEqual(
    week.days.map((d) => d.dayOfMonth),
    [3, 4, 5, 6, 7, 8, 9],
  )

  const mon = week.days[0]
  assert.equal(mon.completed, 1)
  assert.equal(mon.total, 2)
  assert.equal(mon.percent, 50)

  const tue = week.days[1]
  assert.equal(tue.completed, 2)
  assert.equal(tue.total, 2)
  assert.equal(tue.percent, 100)

  // Daily tasks are cadence-visible every day → 2 tasks × 7 days
  assert.equal(week.summary.total, 14)
  assert.equal(week.summary.completed, 3) // Mon 1 + Tue 2
  assert.equal(week.summary.percent, Math.round((3 / 14) * 100))
  assert.equal(week.summary.activeDays, 7)
  assert.equal(week.summary.bestDate, '2026-08-04')

  // Previous week: Daily tasks still cadence-visible (2 × 7), zero completed
  assert.equal(week.previous.total, 14)
  assert.equal(week.previous.completed, 0)
  assert.equal(week.previous.percent, 0)

  // Seed previous week (Mon Jul 27) so previous has completions
  await insertEntry('t1', '2026-07-27', 1, 0)
  await insertEntry('t2', '2026-07-27', 1, 0)
  const week2 = await buildWeekProgress(anchor)
  assert.equal(week2.previous.completed, 2)
  assert.equal(week2.previous.total, 14)
  assert.equal(week2.previous.percent, Math.round((2 / 14) * 100))

  // Future flags: relative to real today — just assert shape for all days
  for (const d of week.days) {
    assert.equal(typeof d.isToday, 'boolean')
    assert.equal(typeof d.isFuture, 'boolean')
    assert.equal(typeof d.goal, 'string')
    // isToday and isFuture are mutually exclusive
    assert.ok(!(d.isToday && d.isFuture))
  }

  await db.prepare(
    `INSERT INTO daily_goals (date, goal, updated_at) VALUES (?, ?, ?)`,
  ).run('2026-08-05', 'Ship week panel', '2026-08-05T12:00:00.000Z')
  const weekWithGoal = await buildWeekProgress(anchor)
  assert.equal(weekWithGoal.days[2].date, '2026-08-05')
  assert.equal(weekWithGoal.days[2].goal, 'Ship week panel')
  assert.equal(weekWithGoal.days[0].goal, '')

  console.log('week-progress tests passed')
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
