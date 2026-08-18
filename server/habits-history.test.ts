import './test-env.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-habits-hist-'))
process.env.TRACKER_DB_PATH = path.join(dir, 'test.db')
process.env.TRACKER_SKIP_SEED = '1'

const { migrate, db } = await import('./db.js')
const {
  buildHabitsProgress,
  habitStreakFromCells,
} = await import('./habits-history.js')

await migrate()

const now = '2026-08-01T00:00:00.000Z'
await db.prepare(
  `INSERT INTO habits (id, title, sort_order, archived, created_at, updated_at)
   VALUES (?, ?, 0, 0, ?, ?)`,
).run('h1', 'Meditate', now, now)

await db.prepare(
  `INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
   VALUES (?, 'h1', ?, 1, ?, ?)`,
).run('e1', '2026-08-04', now, now)
await db.prepare(
  `INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
   VALUES (?, 'h1', ?, 1, ?, ?)`,
).run('e2', '2026-08-05', now, now)
await db.prepare(
  `INSERT INTO habit_entries (id, habit_id, date, completed, created_at, updated_at)
   VALUES (?, 'h1', ?, 0, ?, ?)`,
).run('e3', '2026-08-06', now, now)

const progress = await buildHabitsProgress(7, '2026-08-06')
assert.equal(progress.days, 7)
assert.equal(progress.endDate, '2026-08-06')
assert.equal(progress.startDate, '2026-07-31')
assert.equal(progress.habits.length, 1)
const habit = progress.habits[0]
assert.equal(habit.title, 'Meditate')
assert.equal(habit.completedDays, 2)
assert.ok(habit.trackedDays >= 2)
assert.equal(habit.streak, 0) // Aug 6 incomplete breaks streak

const streakCells = [
  { date: '2026-08-04', completed: true, tracked: true },
  { date: '2026-08-05', completed: true, tracked: true },
  { date: '2026-08-06', completed: true, tracked: true },
]
assert.equal(habitStreakFromCells(streakCells, '2026-08-06'), 3)

const day = progress.daily.find((d) => d.date === '2026-08-05')
assert.ok(day)
assert.equal(day?.completed, 1)
assert.equal(day?.total, 1)

console.log('habits-history tests passed')
db.close()
rmSync(dir, { recursive: true, force: true })
