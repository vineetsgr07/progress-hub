import './test-env.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-habits-progress-'))
process.env.TRACKER_DB_PATH = path.join(dir, 'test.db')
process.env.TRACKER_SKIP_SEED = '1'

const { migrate, db } = await import('./db.js')
const { computeDayProgress } = await import('./day-progress.js')

await migrate()

async function insertTask(id: string, title: string, createdAt = '2026-08-01T00:00:00.000Z') {
  await db.prepare(
    `INSERT INTO tasks (id, title, notes, category, project_tag, priority, status, is_master,
      created_at, updated_at, sort_order, board_sort)
     VALUES (?, ?, '', 'Daily', 'Work', 'Medium', 'todo', 1, ?, ?, 0, 0)`,
  ).run(id, title, createdAt, createdAt)
}

async function insertEntry(taskId: string, date: string, completed: number) {
  const now = `${date}T12:00:00.000Z`
  await db.prepare(
    `INSERT INTO day_entries (id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, NULL, '', ?, ?)`,
  ).run(`${taskId}-${date}`, taskId, date, completed, now, now)
}

try {
  const date = '2026-08-06'
  await insertTask('t1', 'Deep work')
  await insertTask('t2', 'Review')
  await insertEntry('t1', date, 1)
  await insertEntry('t2', date, 0)

  const before = await computeDayProgress(date)
  assert.equal(before.total, 2)
  assert.equal(before.completed, 1)
  assert.equal(before.percent, 50)

  const now = `${date}T12:00:00.000Z`
  await db.prepare(
    `INSERT INTO habits (id, title, sort_order, archived, created_at, updated_at)
     VALUES (?, ?, 0, 0, ?, ?)`,
  ).run('h1', 'Meditate', now, now)
  await db.prepare(
    `INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run('he1', 'h1', date, now, now)
  await db.prepare(
    `INSERT INTO habits (id, title, sort_order, archived, created_at, updated_at)
     VALUES (?, ?, 1, 0, ?, ?)`,
  ).run('h2', 'Walk', now, now)
  await db.prepare(
    `INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`,
  ).run('he2', 'h2', date, now, now)

  const after = await computeDayProgress(date)
  assert.equal(after.total, before.total, 'habits must not change task total')
  assert.equal(
    after.completed,
    before.completed,
    'habits must not change task completed',
  )
  assert.equal(after.percent, before.percent, 'habits must not change task percent')
  assert.deepEqual(after.taskIds, before.taskIds)

  console.log('habits-progress tests passed')
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
