import './test-env.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-insight-'))
process.env.TRACKER_DB_PATH = path.join(dir, 'test.db')
process.env.TRACKER_SKIP_SEED = '1'

const { migrate, db } = await import('./db.js')
const {
  buildAnalyticsInsight,
  habitBudgetFromCompletion,
  rangeStartISO,
  unfinishedDailyInsight,
} = await import('./analytics-insight.js')

await migrate()

assert.equal(rangeStartISO('2026-08-07', 14), '2026-07-25')
assert.equal(habitBudgetFromCompletion(0, 0, 3), 0)
assert.equal(habitBudgetFromCompletion(3, 6, 3), 1.5)
assert.equal(habitBudgetFromCompletion(6, 6, 3), 3)

const now = '2026-08-07T12:00:00.000Z'
const taskId = randomUUID()
await db.prepare(
  `INSERT INTO tasks (
     id, title, notes, category, project_tag, priority, status, is_master,
     sort_order, board_sort, created_at, updated_at
   ) VALUES (?, ?, '', 'Daily', 'Ops', 'Medium', 'todo', 1, 0, 0, ?, ?)`,
).run(taskId, 'Carryover daily', now, now)

await db.prepare(
  `INSERT INTO day_entries (
     id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at
   ) VALUES (?, ?, '2026-08-05', 0, 1.5, NULL, '', ?, ?)`,
).run(randomUUID(), taskId, now, now)

await db.prepare(
  `INSERT INTO day_entries (
     id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at
   ) VALUES (?, ?, '2026-08-07', 0, 0.4, NULL, '', ?, ?)`,
).run(randomUUID(), taskId, now, now)

// Prior 14d window (ends 2026-07-24) — 0.8h so share/prior delta can be asserted
await db.prepare(
  `INSERT INTO day_entries (
     id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at
   ) VALUES (?, ?, '2026-07-20', 0, 0.8, NULL, '', ?, ?)`,
).run(randomUUID(), taskId, now, now)

const unfinished = await unfinishedDailyInsight('2026-08-07', 14)
assert.equal(unfinished.length, 1)
assert.equal(unfinished[0].taskId, taskId)
assert.equal(unfinished[0].todayHours, 0.4)
assert.equal(unfinished[0].totalHours, 1.9)
assert.ok(unfinished[0].priorIncompleteDays >= 1)

const insight = await buildAnalyticsInsight('2026-08-07', 14)
assert.equal(insight.rangeStart, '2026-07-25')
assert.equal(insight.rangeEnd, '2026-08-07')
const dailyCat = insight.hoursByCategory.find((r) => r.key === 'Daily')
assert.ok(dailyCat)
assert.equal(dailyCat!.hours, 1.9)
assert.equal(dailyCat!.sharePercent, 100)
assert.equal(dailyCat!.priorHours, 0.8)
const opsProj = insight.hoursByProject.find((r) => r.key === 'Ops')
assert.ok(opsProj)
assert.equal(opsProj!.hours, 1.9)
assert.equal(opsProj!.sharePercent, 100)
assert.equal(opsProj!.priorHours, 0.8)
assert.equal(insight.unfinishedDailyTotalHours, 1.9)
assert.equal(insight.goals.workTargetHours, 12)
assert.equal(insight.goals.habitBudgetHours, 3)
assert.equal(insight.goals.totalTargetHours, 15)
assert.equal(insight.budgetSeries.length, 14)
assert.equal(insight.todayBudget.date, '2026-08-07')
assert.equal(insight.todayBudget.workHours, 0.4)

// Completed today → not in carryover
await db.prepare(`UPDATE day_entries SET completed = 1 WHERE task_id = ? AND date = '2026-08-07'`).run(
  taskId,
)
assert.equal((await unfinishedDailyInsight('2026-08-07', 14)).length, 0)

rmSync(dir, { recursive: true, force: true })
console.log('analytics-insight tests passed')
