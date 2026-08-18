import './test-env.js'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const dir = mkdtempSync(path.join(tmpdir(), 'tracker-api-'))
process.env.TRACKER_DB_PATH = path.join(dir, 'test.db')
process.env.TRACKER_SKIP_SEED = '1'

const { createApp } = await import('./app.js')
const { db, getBacklogColumnId, getDoingColumnId, getTerminalColumnId } =
  await import('./db.js')

const app = await createApp()
const server: Server = createServer(app)
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address() as AddressInfo
const base = `http://127.0.0.1:${port}`

async function req(method: string, urlPath: string, body?: unknown) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  return { status: res.status, json }
}

const date = '2026-08-06'

try {
  // ---- timer stop returns task to backlog role column; does not touch list sort ----
  {
    const created = await req('POST', '/api/tasks', {
      title: 'Timer task',
      category: 'Daily',
      addToToday: true,
      date,
    })
    assert.equal(created.status, 201)
    const task = created.json as { id: string; sortOrder: number; boardSort: number }
    const listSortBefore = task.sortOrder

    const start = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'start',
    })
    assert.equal(start.status, 200)
    const started = start.json as {
      status: string
      columnId: string
      sortOrder: number
      entry: { timerStartedAt: string | null }
    }
    assert.equal(started.status, 'doing')
    assert.equal(started.columnId, await getDoingColumnId())
    assert.ok(started.entry.timerStartedAt)
    assert.equal(started.sortOrder, listSortBefore, 'timer start must not change list sort')

    // Rename "In Progress" — role still drives doing, not the name
    const doingId = await getDoingColumnId()
    await req('PATCH', `/api/board/columns/${doingId}`, { name: 'Active Work' })
    assert.equal(await getDoingColumnId(), doingId)

    const stop = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'stop',
    })
    assert.equal(stop.status, 200)
    const stopped = stop.json as {
      status: string
      columnId: string
      sortOrder: number
      entry: { timerStartedAt: string | null; hours: number }
    }
    assert.equal(stopped.status, 'todo')
    assert.equal(stopped.columnId, await getBacklogColumnId())
    assert.equal(stopped.entry.timerStartedAt, null)
    assert.ok(stopped.entry.hours > 0)
    assert.equal(stopped.sortOrder, listSortBefore, 'timer stop must not change list sort')
  }

  // ---- board move derives status from role; board_sort ≠ list sort_order ----
  {
    const a = (await req('POST', '/api/tasks', {
      title: 'Board A',
      category: 'Daily',
      addToToday: false,
    })).json as { id: string; sortOrder: number }
    const b = (await req('POST', '/api/tasks', {
      title: 'Board B',
      category: 'Daily',
      addToToday: false,
    })).json as { id: string; sortOrder: number }

    // Create into a status lane (Projects board per-band add)
    const doingCreate = await req('POST', '/api/tasks', {
      title: 'Start in progress',
      category: 'Projects',
      projectTag: 'Personal',
      status: 'doing',
      addToToday: false,
    })
    assert.equal(doingCreate.status, 201)
    const doingTask = doingCreate.json as { id: string; status: string }
    assert.equal(doingTask.status, 'doing')

    // Reorder list: B then A
    await req('PATCH', '/api/tasks/reorder', { orderedIds: [b.id, a.id] })

    const doneId = await getTerminalColumnId()
    assert.ok(doneId)
    const move = await req('PATCH', '/api/board/move', {
      taskId: a.id,
      columnId: doneId,
      orderedTaskIds: [a.id],
      date,
    })
    assert.equal(move.status, 200)
    const moved = move.json as {
      status: string
      columnId: string
      boardSort: number
      sortOrder: number
    }
    assert.equal(moved.status, 'done')
    assert.equal(moved.columnId, doneId)
    assert.equal(moved.boardSort, 0)

    const list = await req('GET', `/api/tasks?date=${date}&master=1`)
    const tasks = (list.json as { tasks: Array<{ id: string; sortOrder: number }> }).tasks
    const aList = tasks.find((t) => t.id === a.id)!
    const bList = tasks.find((t) => t.id === b.id)!
    assert.equal(aList.sortOrder, 1)
    assert.equal(bList.sortOrder, 0)
    assert.notEqual(
      moved.boardSort,
      aList.sortOrder,
      'board_sort and list sort_order must diverge after independent reorders',
    )

    // Renaming Done column must not break terminal role
    await req('PATCH', `/api/board/columns/${doneId}`, { name: 'Shipped' })
    assert.equal(await getTerminalColumnId(), doneId)
    const board = await req('GET', '/api/board')
    const card = (
      board.json as { tasks: Array<{ id: string; status: string }> }
    ).tasks.find((t) => t.id === a.id)!
    assert.equal(card.status, 'done')
  }

  // ---- day-scoped subtasks for Daily; permanent for Weekly ----
  {
    const daily = (await req('POST', '/api/tasks', {
      title: 'Daily checklist',
      category: 'Daily',
      addToToday: true,
      date,
      subtasks: ['Item one'],
    })).json as { id: string; subtasks: Array<{ id: string; done: boolean }> }
    assert.equal(daily.subtasks.length, 1)
    assert.equal(daily.subtasks[0].done, false)

    const dayA = '2026-08-06'
    const dayB = '2026-08-07'
    await req('PATCH', `/api/subtasks/${daily.subtasks[0].id}`, {
      done: true,
      date: dayA,
    })

    const onA = await req('GET', `/api/tasks?date=${dayA}`)
    const taskA = (
      onA.json as { tasks: Array<{ id: string; subtasks: Array<{ done: boolean }> }> }
    ).tasks.find((t) => t.id === daily.id)!
    assert.equal(taskA.subtasks[0].done, true)

    await req('POST', `/api/tasks/${daily.id}/schedule`, { date: dayB })
    const onB = await req('GET', `/api/tasks?date=${dayB}`)
    const taskB = (
      onB.json as { tasks: Array<{ id: string; subtasks: Array<{ done: boolean }> }> }
    ).tasks.find((t) => t.id === daily.id)!
    assert.equal(taskB.subtasks[0].done, false, 'Daily subtask done is day-scoped')

    const weekly = (await req('POST', '/api/tasks', {
      title: 'Weekly checklist',
      category: 'Weekly',
      addToToday: false,
      subtasks: ['Ship it'],
    })).json as { id: string; subtasks: Array<{ id: string; done: boolean }> }

    await req('PATCH', `/api/subtasks/${weekly.subtasks[0].id}`, { done: true })
    const w1 = await req('GET', `/api/tasks?date=${dayA}&category=Weekly&master=1`)
    const wTask = (
      w1.json as { tasks: Array<{ id: string; subtasks: Array<{ done: boolean }> }> }
    ).tasks.find((t) => t.id === weekly.id)!
    assert.equal(wTask.subtasks[0].done, true)

    const w2 = await req('GET', `/api/tasks?date=${dayB}&category=Weekly&master=1`)
    const wTask2 = (
      w2.json as { tasks: Array<{ id: string; subtasks: Array<{ done: boolean }> }> }
    ).tasks.find((t) => t.id === weekly.id)!
    assert.equal(wTask2.subtasks[0].done, true, 'non-Daily subtask done is permanent')
  }

  // ---- empty checklist title allowed (Enter-to-add-below) ----
  {
    const parent = (await req('POST', '/api/tasks', {
      title: 'Enter add parent',
      category: 'Daily',
      addToToday: true,
      date,
      subtasks: ['First'],
    })).json as { id: string; subtasks: Array<{ id: string }> }
    const blank = await req('POST', `/api/tasks/${parent.id}/subtasks`, {
      title: '',
    })
    assert.equal(blank.status, 201)
    const created = blank.json as { id: string; title: string }
    assert.equal(created.title, '')
    const ordered = [
      parent.subtasks[0].id,
      created.id,
    ]
    const reorder = await req(
      'PATCH',
      `/api/tasks/${parent.id}/subtasks/reorder`,
      { orderedIds: ordered },
    )
    assert.equal(reorder.status, 200)
  }

  // ---- cadence All: period only on cadence / capped overflow ----
  {
    const fri = '2026-08-07'
    const sat = '2026-08-08'
    const thu = '2026-08-06'

    // Seed an older weekly (existed before prior Friday 2026-07-31)
    await db.prepare(`
      INSERT INTO tasks (
        id, title, notes, category, project_tag, priority, status, is_master,
        column_id, sort_order, board_sort, created_at, updated_at
      ) VALUES (?, 'Old weekly', '', 'Weekly', 'Work', 'Medium', 'todo', 1, ?, 0, 0, ?, ?)
    `).run(
      'weekly-old',
      await getBacklogColumnId(),
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    )

    const fresh = (await req('POST', '/api/tasks', {
      title: 'Fresh weekly',
      category: 'Weekly',
      addToToday: true,
      date: thu,
    })).json as { id: string }

    // Thursday All: fresh weekly created mid-week must NOT appear (no pin from day_entry)
    const thuAll = await req('GET', `/api/tasks?date=${thu}`)
    const thuIds = (
      thuAll.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(!thuIds.includes(fresh.id), 'mid-week create must not pin Weekly on All')

    // Complete prior Friday occurrence for old weekly → Thursday All hides it
    const now = new Date().toISOString()
    await db.prepare(`
      INSERT INTO day_entries (
        id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at
      ) VALUES (?, 'weekly-old', '2026-07-31', 1, 0, NULL, '', ?, ?)
    `).run('de-old-done', now, now)

    const thuAll2 = await req('GET', `/api/tasks?date=${thu}`)
    const thuIds2 = (
      thuAll2.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(
      !thuIds2.includes('weekly-old'),
      'completed prior Friday must not overflow to Thursday All',
    )

    // Incomplete prior Friday → Saturday overflow
    await db.prepare(`DELETE FROM day_entries WHERE task_id = 'weekly-old'`).run()
    const satAll = await req('GET', `/api/tasks?date=${sat}`)
    const satIds = (
      satAll.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(satIds.includes('weekly-old'), 'incomplete Friday must overflow to Saturday All')

    // Complete on Saturday → Sunday hides
    await req('PATCH', `/api/day-entries/weekly-old`, {
      date: sat,
      completed: true,
    })
    const sun = '2026-08-09'
    const sunAll = await req('GET', `/api/tasks?date=${sun}`)
    const sunIds = (
      sunAll.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(
      !sunIds.includes('weekly-old'),
      'completed overflow day must not carry to next day',
    )

    // Friday cadence always shows
    const friAll = await req('GET', `/api/tasks?date=${fri}`)
    const friIds = (
      friAll.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(friIds.includes('weekly-old'), 'Weekly must appear on Friday All')
    assert.ok(friIds.includes(fresh.id), 'Fresh Weekly must appear on Friday All')

    // Weekly chip always lists
    const weeklyChip = await req('GET', `/api/tasks?date=${thu}&category=Weekly`)
    const chipIds = (
      weeklyChip.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(chipIds.includes('weekly-old'))
    assert.ok(chipIds.includes(fresh.id))
  }

  // ---- progress series: cadence-honest day/week/month ----
  {
    const fri = '2026-08-07'
    const thu = '2026-08-06'

    // Ensure a durable weekly for Friday counting (re-seed after import wiped earlier data)
    const weeklyId = 'progress-weekly'
    await db.prepare(`DELETE FROM day_entries WHERE task_id = ?`).run(weeklyId)
    await db.prepare(`DELETE FROM tasks WHERE id = ?`).run(weeklyId)
    await db.prepare(`
      INSERT INTO tasks (
        id, title, notes, category, project_tag, priority, status, is_master,
        column_id, sort_order, board_sort, created_at, updated_at
      ) VALUES (?, 'Progress weekly', '', 'Weekly', 'Work', 'Medium', 'todo', 1, ?, 0, 0, ?, ?)
    `).run(
      weeklyId,
      await getBacklogColumnId(),
      '2026-07-01T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    )

    // Complete prior Friday occurrence → Thursday must not include weekly in totals
    const now = new Date().toISOString()
    await db.prepare(`
      INSERT INTO day_entries (
        id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at
      ) VALUES (?, ?, '2026-07-31', 1, 0, NULL, '', ?, ?)
    `).run('de-progress-done', weeklyId, now, now)

    const thuProg = await req('GET', `/api/stats/progress?date=${thu}&range=day`)
    assert.equal(thuProg.status, 200)
    const thuSeries = thuProg.json as {
      range: string
      series: Array<{ key: string; total: number; completed: number }>
    }
    assert.equal(thuSeries.range, 'day')
    assert.equal(thuSeries.series.length, 14)
    const thuPoint = thuSeries.series.find((p) => p.key === thu)
    assert.ok(thuPoint)
    // Daily tasks from earlier tests may still exist; weekly must not inflate Thursday
    const thuStats = await req('GET', `/api/stats?date=${thu}`)
    const thuToday = (thuStats.json as { today: { total: number } }).today
    assert.equal(thuPoint!.total, thuToday.total)

    const tasksThu = await req('GET', `/api/tasks?date=${thu}`)
    const thuTaskIds = (
      tasksThu.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(!thuTaskIds.includes(weeklyId))

    // Friday cadence includes the weekly
    await db.prepare(`DELETE FROM day_entries WHERE task_id = ?`).run(weeklyId)
    const friProg = await req('GET', `/api/stats/progress?date=${fri}&range=day`)
    assert.equal(friProg.status, 200)
    const friSeries = friProg.json as {
      series: Array<{ key: string; total: number }>
    }
    const friPoint = friSeries.series.find((p) => p.key === fri)
    assert.ok(friPoint)
    const friTasks = await req('GET', `/api/tasks?date=${fri}`)
    const friIds = (
      friTasks.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(friIds.includes(weeklyId))
    assert.equal(
      friPoint!.total,
      (friTasks.json as { tasks: unknown[] }).tasks.length,
    )

    const weekProg = await req('GET', `/api/stats/progress?date=${fri}&range=week`)
    assert.equal(weekProg.status, 200)
    const weekBody = weekProg.json as { series: unknown[] }
    assert.equal(weekBody.series.length, 8)

    const monthProg = await req(
      'GET',
      `/api/stats/progress?date=${fri}&range=month`,
    )
    assert.equal(monthProg.status, 200)
    const monthBody = monthProg.json as { series: unknown[] }
    assert.equal(monthBody.series.length, 6)

    const bad = await req('GET', `/api/stats/progress?date=${fri}&range=year`)
    assert.equal(bad.status, 400)
  }

  // ---- per-task Weekly/Monthly cadence ----
  {
    const wed = '2026-08-05'
    const thu = '2026-08-06'
    const fri = '2026-08-07'

    const wedWeekly = (await req('POST', '/api/tasks', {
      title: 'Wed weekly',
      category: 'Weekly',
      cadenceWeekday: 3,
      addToToday: false,
      date: wed,
    })).json as { id: string; cadenceWeekday: number | null }
    assert.equal(wedWeekly.cadenceWeekday, 3)

    // Persist created_at before prior Wed so overflow can apply
    await db.prepare(`UPDATE tasks SET created_at = ? WHERE id = ?`).run(
      '2026-07-01T00:00:00.000Z',
      wedWeekly.id,
    )

    const wedAll = await req('GET', `/api/tasks?date=${wed}`)
    const wedIds = (
      wedAll.json as { tasks: Array<{ id: string }> }
    ).tasks.map((t) => t.id)
    assert.ok(wedIds.includes(wedWeekly.id), 'Wed weekly must appear on Wednesday All')

    const friAllNoComplete = await req('GET', `/api/tasks?date=${fri}`)
    assert.ok(
      (
        friAllNoComplete.json as { tasks: Array<{ id: string }> }
      ).tasks.some((t) => t.id === wedWeekly.id),
      'incomplete Wed weekly overflows past Friday (not global Fri cadence)',
    )

    const now = new Date().toISOString()
    await db.prepare(`
      INSERT INTO day_entries (
        id, task_id, date, completed, hours, timer_started_at, notes, created_at, updated_at
      ) VALUES (?, ?, '2026-08-05', 1, 0, NULL, '', ?, ?)
    `).run('de-wed-done', wedWeekly.id, now, now)

    const thuAll = await req('GET', `/api/tasks?date=${thu}`)
    assert.ok(
      !(thuAll.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === wedWeekly.id,
      ),
      'completed Wed occurrence must not overflow to Thursday',
    )

    const midMonth = (await req('POST', '/api/tasks', {
      title: 'Mid-month review',
      category: 'Monthly',
      cadenceMonthDay: 15,
      addToToday: false,
      date: '2026-08-15',
    })).json as { id: string; cadenceMonthDay: number | null }
    assert.equal(midMonth.cadenceMonthDay, 15)
    await db.prepare(`UPDATE tasks SET created_at = ? WHERE id = ?`).run(
      '2026-07-20T00:00:00.000Z',
      midMonth.id,
    )

    const on15 = await req('GET', `/api/tasks?date=2026-08-15`)
    assert.ok(
      (on15.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === midMonth.id,
      ),
    )
    const on1 = await req('GET', `/api/tasks?date=2026-08-01`)
    assert.ok(
      !(on1.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === midMonth.id,
      ),
      'day-15 monthly created after Jul 15 must not appear on the 1st',
    )

    const badWeekday = await req('POST', '/api/tasks', {
      title: 'Bad',
      category: 'Weekly',
      cadenceWeekday: 9,
    })
    assert.equal(badWeekday.status, 400)

    // Category change: Weekly → Daily clears; Daily → Weekly defaults Friday
    const flipped = (await req('PATCH', `/api/tasks/${wedWeekly.id}`, {
      category: 'Daily',
      date: thu,
    })).json as {
      category: string
      cadenceWeekday: number | null
      cadenceMonthDay: number | null
    }
    assert.equal(flipped.category, 'Daily')
    assert.equal(flipped.cadenceWeekday, null)
    assert.equal(flipped.cadenceMonthDay, null)

    const back = (await req('PATCH', `/api/tasks/${wedWeekly.id}`, {
      category: 'Weekly',
      date: thu,
    })).json as { cadenceWeekday: number | null }
    assert.equal(back.cadenceWeekday, 5)
  }

  // ---- export / import round-trip ----
  {
    const exported = await req('GET', '/api/export')
    assert.equal(exported.status, 200)
    const payload = exported.json as Record<string, unknown>
    assert.ok(Array.isArray(payload.tasks))
    assert.ok(Array.isArray(payload.subtaskDayState))

    // Wipe via import of empty-ish valid backup then restore
    const emptyCols = (
      payload.boardColumns as Array<Record<string, unknown>>
    ).slice(0, 3)
    await req('POST', '/api/import', {
      tasks: [],
      boardColumns: emptyCols,
      subtasks: [],
      subtaskDayState: [],
      dayEntries: [],
      goals: [],
      timeLogs: [],
    })
    const wiped = await req('GET', '/api/board')
    assert.equal((wiped.json as { tasks: unknown[] }).tasks.length, 0)

    const restored = await req('POST', '/api/import', payload)
    assert.equal(restored.status, 200)
    const after = await req('GET', '/api/board')
    assert.equal(
      (after.json as { tasks: unknown[] }).tasks.length,
      (payload.tasks as unknown[]).length,
    )
  }

  // ---- list column sort + settings persistence ----
  {
    const low = (await req('POST', '/api/tasks', {
      title: 'Sort Low',
      priority: 'Low',
      projectTag: 'Zulu',
      category: 'Goal',
      addToToday: false,
    })).json as { id: string }

    const high = (await req('POST', '/api/tasks', {
      title: 'Sort High',
      priority: 'High',
      projectTag: 'Alpha',
      category: 'Daily',
      addToToday: false,
    })).json as { id: string }

    const mid = (await req('POST', '/api/tasks', {
      title: 'Sort Mid',
      priority: 'Medium',
      projectTag: 'Marketing',
      category: 'Weekly',
      addToToday: false,
    })).json as { id: string }

    const byPriority = await req('PATCH', '/api/tasks/sort', {
      field: 'priority',
      dir: 'asc',
    })
    assert.equal(byPriority.status, 200)
    const pOrder = (byPriority.json as { orderedIds: string[]; listSort: { field: string; dir: string } })
    assert.equal(pOrder.listSort.field, 'priority')
    assert.equal(pOrder.listSort.dir, 'asc')
    const pIdx = (id: string) => pOrder.orderedIds.indexOf(id)
    assert.ok(pIdx(high.id) < pIdx(mid.id))
    assert.ok(pIdx(mid.id) < pIdx(low.id))

    const settings = await req('GET', '/api/settings')
    assert.equal(settings.status, 200)
    assert.equal(
      (settings.json as { listSort: { field: string } }).listSort.field,
      'priority',
    )

    const byProject = await req('PATCH', '/api/tasks/sort', {
      field: 'project',
      dir: 'asc',
    })
    assert.equal(byProject.status, 200)
    const projIds = (byProject.json as { orderedIds: string[] }).orderedIds
    assert.ok(projIds.indexOf(high.id) < projIds.indexOf(mid.id))
    assert.ok(projIds.indexOf(mid.id) < projIds.indexOf(low.id))

    const colors = {
      category: { Daily: 'blue' },
      project: { Marketing: 'pink' },
      priority: { High: 'red' },
    }
    const patched = await req('PATCH', '/api/settings', { tagColors: colors })
    assert.equal(patched.status, 200)
    assert.deepEqual(
      (patched.json as { tagColors: typeof colors }).tagColors,
      colors,
    )

    const settings2 = await req('GET', '/api/settings')
    assert.deepEqual(
      (settings2.json as { tagColors: typeof colors }).tagColors,
      colors,
    )

    // Manual drag clears column-sort preference
    const reorder = await req('PATCH', '/api/tasks/reorder', {
      orderedIds: [low.id, high.id, mid.id],
    })
    assert.equal(reorder.status, 200)
    assert.equal(
      (reorder.json as { listSort: { field: string } }).listSort.field,
      'manual',
    )
    const afterDrag = await req('GET', '/api/settings')
    assert.equal(
      (afterDrag.json as { listSort: { field: string } }).listSort.field,
      'manual',
    )
  }

  // ---- standalone notes + unified list ----
  {
    const createdTask = await req('POST', '/api/tasks', {
      title: 'Task with notes',
      notes: '<p>Hello from task</p>',
      category: 'Daily',
      projectTag: 'Marketing',
      priority: 'High',
      addToToday: true,
      date,
    })
    assert.equal(createdTask.status, 201)
    const task = createdTask.json as { id: string }

    const createdNote = await req('POST', '/api/notes', {
      title: 'Standalone idea',
      body: '<p>Body text</p>',
      projectTag: 'Personal',
      priority: 'Medium',
    })
    assert.equal(createdNote.status, 201)
    const note = createdNote.json as {
      id: string
      source: string
      title: string
      body: string
    }
    assert.equal(note.source, 'note')
    assert.equal(note.title, 'Standalone idea')

    const list = await req('GET', '/api/notes')
    assert.equal(list.status, 200)
    const notes = (list.json as { notes: Array<{ id: string; source: string; excerpt: string }> })
      .notes
    assert.ok(notes.some((n) => n.id === task.id && n.source === 'task'))
    assert.ok(notes.some((n) => n.id === note.id && n.source === 'note'))
    assert.ok(
      notes.find((n) => n.id === task.id)?.excerpt.includes('Hello from task'),
    )

    const filtered = await req('GET', '/api/notes?project=Personal&source=note')
    const filteredNotes = (filtered.json as { notes: Array<{ id: string }> }).notes
    assert.equal(filteredNotes.length, 1)
    assert.equal(filteredNotes[0].id, note.id)

    const detail = await req('GET', `/api/notes/note/${note.id}`)
    assert.equal(detail.status, 200)
    assert.equal((detail.json as { body: string }).body, '<p>Body text</p>')

    const patched = await req('PATCH', `/api/notes/${note.id}`, {
      title: 'Updated idea',
      pinned: true,
      priority: 'High',
    })
    assert.equal(patched.status, 200)
    assert.equal((patched.json as { title: string; pinned: boolean }).title, 'Updated idea')
    assert.equal((patched.json as { pinned: boolean }).pinned, true)

    const cleared = await req('POST', `/api/notes/task/${task.id}/clear`)
    assert.equal(cleared.status, 204)
    const listAfterClear = await req('GET', '/api/notes?source=task')
    const taskNotes = (listAfterClear.json as { notes: Array<{ id: string }> }).notes
    assert.ok(!taskNotes.some((n) => n.id === task.id))

    const exported = await req('GET', '/api/export')
    assert.equal(exported.status, 200)
    const payload = exported.json as {
      tasks: unknown[]
      boardColumns: unknown[]
      standaloneNotes: Array<{ id: string }>
    }
    assert.ok(payload.standaloneNotes.some((n) => n.id === note.id))

    const imported = await req('POST', '/api/import', payload)
    assert.equal(imported.status, 200)
    assert.equal(
      (imported.json as { counts: { notes: number } }).counts.notes,
      payload.standaloneNotes.length,
    )

    const afterImport = await req('GET', `/api/notes/note/${note.id}`)
    assert.equal(afterImport.status, 200)
    assert.equal((afterImport.json as { title: string }).title, 'Updated idea')

    const deleted = await req('DELETE', `/api/notes/${note.id}`)
    assert.equal(deleted.status, 204)
    const gone = await req('GET', `/api/notes/note/${note.id}`)
    assert.equal(gone.status, 404)
  }

  // ---- notes manual reorder ----
  {
    const a = await req('POST', '/api/notes', {
      title: 'Alpha',
      body: '<p>a</p>',
      projectTag: 'Personal',
    })
    const b = await req('POST', '/api/notes', {
      title: 'Beta',
      body: '<p>b</p>',
      projectTag: 'Personal',
    })
    const c = await req('POST', '/api/notes', {
      title: 'Gamma',
      body: '<p>c</p>',
      projectTag: 'Personal',
    })
    assert.equal(a.status, 201)
    assert.equal(b.status, 201)
    assert.equal(c.status, 201)
    const aId = (a.json as { id: string }).id
    const bId = (b.json as { id: string }).id
    const cId = (c.json as { id: string }).id

    const reorder = await req('PATCH', '/api/notes/reorder', {
      orderedKeys: [`note:${cId}`, `note:${aId}`, `note:${bId}`],
    })
    assert.equal(reorder.status, 200)

    const listed = await req('GET', '/api/notes?source=note&sort=manual')
    assert.equal(listed.status, 200)
    const ids = (
      listed.json as { notes: Array<{ id: string }> }
    ).notes
      .filter((n) => [aId, bId, cId].includes(n.id))
      .map((n) => n.id)
    assert.deepEqual(ids, [cId, aId, bId])

    await req('DELETE', `/api/notes/${aId}`)
    await req('DELETE', `/api/notes/${bId}`)
    await req('DELETE', `/api/notes/${cId}`)
  }

  // ---- notes recent vs older scope ----
  {
    const fresh = await req('POST', '/api/notes', {
      title: 'Fresh note',
      body: '<p>new</p>',
      projectTag: 'Personal',
    })
    assert.equal(fresh.status, 201)
    const freshId = (fresh.json as { id: string }).id

    const staleId = crypto.randomUUID()
    const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
    await db.prepare(
      `INSERT INTO standalone_notes
        (id, title, body, project_tag, priority, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(staleId, 'Stale note', '<p>old</p>', 'Personal', 'Medium', oldIso, oldIso)

    const recent = await req('GET', '/api/notes?source=note&scope=recent')
    assert.equal(recent.status, 200)
    const recentBody = recent.json as {
      notes: Array<{ id: string }>
      olderCount: number
    }
    assert.ok(recentBody.notes.some((n) => n.id === freshId))
    assert.ok(!recentBody.notes.some((n) => n.id === staleId))
    assert.ok(recentBody.olderCount >= 1)

    const older = await req('GET', '/api/notes?source=note&scope=older')
    assert.equal(older.status, 200)
    const olderBody = older.json as { notes: Array<{ id: string }> }
    assert.ok(olderBody.notes.some((n) => n.id === staleId))
    assert.ok(!olderBody.notes.some((n) => n.id === freshId))

    await db
      .prepare(`UPDATE standalone_notes SET pinned = 1 WHERE id = ?`)
      .run(staleId)
    const recentPinned = await req('GET', '/api/notes?source=note&scope=recent')
    const recentPinnedBody = recentPinned.json as {
      notes: Array<{ id: string; excerpt?: string; body?: string }>
    }
    assert.ok(recentPinnedBody.notes.some((n) => n.id === staleId))
    assert.ok(recentPinnedBody.notes.every((n) => n.excerpt != null))
    assert.ok(recentPinnedBody.notes.every((n) => n.body === undefined))

    const pinnedOnly = await req('GET', '/api/notes?pinned=1')
    assert.equal(pinnedOnly.status, 200)
    const pinnedOnlyBody = pinnedOnly.json as {
      notes: Array<{ id: string; source: string; pinned: boolean }>
      olderCount: number
    }
    assert.equal(pinnedOnlyBody.olderCount, 0)
    assert.ok(pinnedOnlyBody.notes.length > 0)
    assert.ok(pinnedOnlyBody.notes.every((n) => n.pinned && n.source === 'note'))
    assert.ok(pinnedOnlyBody.notes.some((n) => n.id === staleId))
    assert.ok(!pinnedOnlyBody.notes.some((n) => n.id === freshId))

    const hiddenStaleId = crypto.randomUUID()
    await db.prepare(
      `INSERT INTO standalone_notes
        (id, title, body, project_tag, priority, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(
      hiddenStaleId,
      'Zebra old unique',
      '<p>hidden stale</p>',
      'Personal',
      'Medium',
      oldIso,
      oldIso,
    )
    const searchHidden = await req(
      'GET',
      '/api/notes?source=note&q=Zebra%20old%20unique',
    )
    const searchHiddenBody = searchHidden.json as { notes: Array<{ id: string }> }
    assert.ok(!searchHiddenBody.notes.some((n) => n.id === hiddenStaleId))

    const ids: string[] = []
    for (let i = 0; i < 51; i++) {
      const created = await req('POST', '/api/notes', {
        title: `Limit note ${i}`,
        body: `<p>cap ${i}</p>`,
        projectTag: 'Personal',
      })
      assert.equal(created.status, 201)
      ids.push((created.json as { id: string }).id)
    }
    const capped = await req('GET', '/api/notes?source=note&scope=recent')
    assert.equal(capped.status, 200)
    const cappedBody = capped.json as { notes: Array<{ id: string }> }
    assert.equal(cappedBody.notes.length, 50)
    const limited = await req('GET', '/api/notes?source=note&scope=recent&limit=2')
    assert.equal((limited.json as { notes: unknown[] }).notes.length, 2)

    await req('DELETE', `/api/notes/${freshId}`)
    await req('DELETE', `/api/notes/${staleId}`)
    await req('DELETE', `/api/notes/${hiddenStaleId}`)
    for (const id of ids) {
      await req('DELETE', `/api/notes/${id}`)
    }
  }

  // ---- checklist focus timers: attribution + auto-stop + validation ----
  {
    const created = await req('POST', '/api/tasks', {
      title: 'Focus parent',
      category: 'Daily',
      addToToday: true,
      date,
      subtasks: ['Alpha', 'Beta'],
    })
    assert.equal(created.status, 201)
    const task = created.json as {
      id: string
      subtasks: Array<{ id: string; title: string; hours: number }>
    }
    assert.equal(task.subtasks.length, 2)
    const [alpha, beta] = task.subtasks

    const bad = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'start',
      subtaskId: 'missing-subtask',
    })
    assert.equal(bad.status, 400)

    const startA = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'start',
      subtaskId: alpha.id,
    })
    assert.equal(startA.status, 200)
    const startedA = startA.json as {
      entry: { timerStartedAt: string | null; timerSubtaskId: string | null }
      subtasks: Array<{ id: string; hours: number }>
    }
    assert.ok(startedA.entry.timerStartedAt)
    assert.equal(startedA.entry.timerSubtaskId, alpha.id)

    // Switch to Beta on same task — Alpha session should be logged
    await new Promise((r) => setTimeout(r, 40))
    const startB = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'start',
      subtaskId: beta.id,
    })
    assert.equal(startB.status, 200)
    const startedB = startB.json as {
      entry: { timerSubtaskId: string | null; hours: number }
      subtasks: Array<{ id: string; hours: number }>
    }
    assert.equal(startedB.entry.timerSubtaskId, beta.id)
    const alphaHours = startedB.subtasks.find((s) => s.id === alpha.id)?.hours ?? 0
    assert.ok(alphaHours > 0, 'Alpha should have attributed hours after switch')

    const stopB = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'stop',
    })
    assert.equal(stopB.status, 200)
    const stopped = stopB.json as {
      entry: { timerStartedAt: string | null; timerSubtaskId: string | null }
      subtasks: Array<{ id: string; hours: number }>
    }
    assert.equal(stopped.entry.timerStartedAt, null)
    assert.equal(stopped.entry.timerSubtaskId, null)
    const betaHours = stopped.subtasks.find((s) => s.id === beta.id)?.hours ?? 0
    assert.ok(betaHours > 0)

    const stats = await req('GET', `/api/stats?date=${date}`)
    assert.equal(stats.status, 200)
    const sessions = (stats.json as { sessions: Array<{ subtaskId: string | null }> })
      .sessions
    assert.ok(sessions.some((s) => s.subtaskId === alpha.id))
    assert.ok(sessions.some((s) => s.subtaskId === beta.id))

    // Marking a checklist item done while its timer runs should bank + clear
    const startDone = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'start',
      subtaskId: alpha.id,
    })
    assert.equal(startDone.status, 200)
    assert.ok(
      (startDone.json as { entry: { timerStartedAt: string | null } }).entry
        .timerStartedAt,
    )
    await new Promise((r) => setTimeout(r, 40))
    const markDone = await req('PATCH', `/api/subtasks/${alpha.id}`, {
      done: true,
      date,
    })
    assert.equal(markDone.status, 200)
    assert.equal((markDone.json as { done: boolean }).done, true)

    const afterDone = await req('GET', `/api/tasks?date=${date}`)
    assert.equal(afterDone.status, 200)
    const parentAfter = (
      afterDone.json as {
        tasks: Array<{
          id: string
          entry: { timerStartedAt: string | null; timerSubtaskId: string | null }
          subtasks: Array<{ id: string; hours: number; done: boolean }>
        }>
      }
    ).tasks.find((t) => t.id === task.id)
    assert.ok(parentAfter)
    assert.equal(parentAfter!.entry.timerStartedAt, null)
    assert.equal(parentAfter!.entry.timerSubtaskId, null)
    const alphaAfter = parentAfter!.subtasks.find((s) => s.id === alpha.id)
    assert.ok(alphaAfter)
    assert.equal(alphaAfter!.done, true)
    assert.ok(alphaAfter!.hours > 0, 'done checklist item should keep banked hours')

    // Task without checklist still starts/stops
    const plain = await req('POST', '/api/tasks', {
      title: 'No checklist',
      category: 'Daily',
      addToToday: true,
      date,
    })
    const plainId = (plain.json as { id: string }).id
    const plainStart = await req('PATCH', `/api/day-entries/${plainId}`, {
      date,
      timerAction: 'start',
    })
    assert.equal(plainStart.status, 200)
    assert.equal(
      (plainStart.json as { entry: { timerSubtaskId: string | null } }).entry
        .timerSubtaskId,
      null,
    )
    const plainStop = await req('PATCH', `/api/day-entries/${plainId}`, {
      date,
      timerAction: 'stop',
    })
    assert.equal(plainStop.status, 200)
  }

  // ---- habits: CRUD, check-in, progress isolation, export/import ----
  {
    const statsBefore = await req('GET', `/api/stats?date=${date}`)
    assert.equal(statsBefore.status, 200)
    const beforeToday = (
      statsBefore.json as {
        today: { completed: number; total: number; percent: number }
      }
    ).today

    const created = await req('POST', '/api/habits', { title: 'Meditate' })
    assert.equal(created.status, 201)
    const habit = created.json as {
      id: string
      title: string
      completed: boolean
      archived: boolean
    }
    assert.equal(habit.title, 'Meditate')
    assert.equal(habit.completed, false)
    assert.equal(habit.archived, false)

    const second = await req('POST', '/api/habits', { title: 'Walk' })
    assert.equal(second.status, 201)
    const habitB = second.json as { id: string }

    const reordered = await req('PATCH', '/api/habits/reorder', {
      orderedIds: [habitB.id, habit.id],
    })
    assert.equal(reordered.status, 200)
    assert.equal((reordered.json as { ok: boolean; count: number }).count, 2)

    const listedOrder = await req('GET', `/api/habits?date=${date}`)
    assert.equal(listedOrder.status, 200)
    const orderIds = (
      listedOrder.json as { habits: Array<{ id: string }> }
    ).habits.map((h) => h.id)
    const iA = orderIds.indexOf(habit.id)
    const iB = orderIds.indexOf(habitB.id)
    assert.ok(iB >= 0 && iA >= 0 && iB < iA, 'Walk should sort before Meditate')

    const emptyReorder = await req('PATCH', '/api/habits/reorder', {
      orderedIds: [],
    })
    assert.equal(emptyReorder.status, 400)

    const emptyTitle = await req('POST', '/api/habits', { title: '  ' })
    assert.equal(emptyTitle.status, 400)

    const listed = await req('GET', `/api/habits?date=${date}`)
    assert.equal(listed.status, 200)
    const listBody = listed.json as {
      habits: Array<{ id: string; completed: boolean }>
      summary: { completed: number; total: number }
    }
    assert.ok(listBody.habits.some((h) => h.id === habit.id))
    assert.equal(listBody.summary.total >= 1, true)

    const toggled = await req('PUT', `/api/habits/${habit.id}/entry`, {
      date,
      completed: true,
    })
    assert.equal(toggled.status, 200)
    assert.equal((toggled.json as { completed: boolean }).completed, true)

    const listedDone = await req('GET', `/api/habits?date=${date}`)
    const doneHabit = (
      listedDone.json as { habits: Array<{ id: string; completed: boolean }> }
    ).habits.find((h) => h.id === habit.id)
    assert.equal(doneHabit?.completed, true)

    // New calendar day: same habits, fresh unchecked entries (daily reset).
    const nextDate = (() => {
      const d = new Date(`${date}T12:00:00`)
      d.setDate(d.getDate() + 1)
      return d.toISOString().slice(0, 10)
    })()
    const nextDay = await req('GET', `/api/habits?date=${nextDate}`)
    assert.equal(nextDay.status, 200)
    const nextHabit = (
      nextDay.json as { habits: Array<{ id: string; completed: boolean }> }
    ).habits.find((h) => h.id === habit.id)
    assert.ok(nextHabit)
    assert.equal(nextHabit?.completed, false)

    const statsAfter = await req('GET', `/api/stats?date=${date}`)
    assert.equal(statsAfter.status, 200)
    const afterToday = (
      statsAfter.json as {
        today: { completed: number; total: number; percent: number }
      }
    ).today
    assert.equal(afterToday.total, beforeToday.total)
    assert.equal(afterToday.completed, beforeToday.completed)
    assert.equal(afterToday.percent, beforeToday.percent)

    const renamed = await req('PATCH', `/api/habits/${habit.id}`, {
      title: 'Morning meditate',
    })
    assert.equal(renamed.status, 200)
    assert.equal((renamed.json as { title: string }).title, 'Morning meditate')

    const archived = await req('PATCH', `/api/habits/${habit.id}`, {
      archived: true,
    })
    assert.equal(archived.status, 200)
    assert.equal((archived.json as { archived: boolean }).archived, true)

    const activeOnly = await req('GET', `/api/habits?date=${date}`)
    assert.ok(
      !(
        activeOnly.json as { habits: Array<{ id: string }> }
      ).habits.some((h) => h.id === habit.id),
    )

    await req('PATCH', `/api/habits/${habit.id}`, { archived: false })

    const exported = await req('GET', '/api/export')
    assert.equal(exported.status, 200)
    const payload = exported.json as {
      tasks: unknown[]
      boardColumns: unknown[]
      habits: Array<{ id: string; title: string }>
      habitEntries: Array<{ habit_id: string; date: string; completed: number }>
    }
    assert.ok(payload.habits.some((h) => h.id === habit.id))
    assert.ok(
      payload.habitEntries.some(
        (e) => e.habit_id === habit.id && e.date === date && e.completed === 1,
      ),
    )

    const imported = await req('POST', '/api/import', payload)
    assert.equal(imported.status, 200)
    assert.equal(
      (imported.json as { counts: { habits: number; habitEntries: number } })
        .counts.habits,
      payload.habits.length,
    )
    assert.equal(
      (imported.json as { counts: { habitEntries: number } }).counts
        .habitEntries,
      payload.habitEntries.length,
    )

    const afterImport = await req('GET', `/api/habits?date=${date}`)
    const restored = (
      afterImport.json as {
        habits: Array<{ id: string; title: string; completed: boolean }>
      }
    ).habits.find((h) => h.id === habit.id)
    assert.ok(restored)
    assert.equal(restored?.title, 'Morning meditate')
    assert.equal(restored?.completed, true)

    const deleted = await req('DELETE', `/api/habits/${habit.id}`)
    assert.equal(deleted.status, 204)
    const gone = await req('GET', `/api/habits?date=${date}`)
    assert.ok(
      !(gone.json as { habits: Array<{ id: string }> }).habits.some(
        (h) => h.id === habit.id,
      ),
    )
  }

  // ---- mindmaps: CRUD, validation, export/import ----
  {
    const created = await req('POST', '/api/mindmaps', { title: 'Launch flow' })
    assert.equal(created.status, 201)
    const map = created.json as {
      id: string
      title: string
      document: { nodes: unknown[]; edges: unknown[] }
    }
    assert.equal(map.title, 'Launch flow')
    assert.deepEqual(map.document.nodes, [])
    assert.deepEqual(map.document.edges, [])

    const listed = await req('GET', '/api/mindmaps')
    assert.equal(listed.status, 200)
    const listBody = listed.json as {
      mindmaps: Array<{ id: string; title: string; document?: unknown }>
    }
    assert.ok(listBody.mindmaps.some((m) => m.id === map.id))
    assert.equal(
      listBody.mindmaps.find((m) => m.id === map.id)?.document,
      undefined,
    )

    const doc = {
      nodes: [
        {
          id: 'n1',
          type: 'mindmap',
          position: { x: 10, y: 20 },
          data: { label: 'Start' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1.2 },
    }
    const patched = await req('PATCH', `/api/mindmaps/${map.id}`, {
      document: doc,
      title: 'Launch flow v2',
    })
    assert.equal(patched.status, 200)
    const patchedBody = patched.json as {
      title: string
      document: typeof doc
    }
    assert.equal(patchedBody.title, 'Launch flow v2')
    assert.equal(patchedBody.document.nodes.length, 1)
    assert.equal(
      (patchedBody.document.nodes[0] as { data: { label: string } }).data.label,
      'Start',
    )

    const got = await req('GET', `/api/mindmaps/${map.id}`)
    assert.equal(got.status, 200)
    assert.equal(
      (got.json as { document: typeof doc }).document.viewport?.zoom,
      1.2,
    )

    const badDoc = await req('PATCH', `/api/mindmaps/${map.id}`, {
      document: { nodes: [] },
    })
    assert.equal(badDoc.status, 400)

    const hugeNodes = Array.from({ length: 80_000 }, (_, i) => ({
      id: `n${i}`,
      position: { x: i, y: i },
      data: { label: 'x'.repeat(40) },
    }))
    const tooBig = await req('PATCH', `/api/mindmaps/${map.id}`, {
      document: { nodes: hugeNodes, edges: [] },
    })
    assert.equal(tooBig.status, 400)

    const exported = await req('GET', '/api/export')
    assert.equal(exported.status, 200)
    const payload = exported.json as {
      mindmaps: Array<{ id: string; title: string; document: string }>
      tasks: unknown[]
      boardColumns: unknown[]
    }
    assert.ok(payload.mindmaps.some((m) => m.id === map.id))

    const imported = await req('POST', '/api/import', payload)
    assert.equal(imported.status, 200)
    assert.equal(
      (imported.json as { counts: { mindmaps: number } }).counts.mindmaps,
      payload.mindmaps.length,
    )

    const afterImport = await req('GET', `/api/mindmaps/${map.id}`)
    assert.equal(afterImport.status, 200)
    assert.equal(
      (afterImport.json as { title: string }).title,
      'Launch flow v2',
    )
    assert.equal(
      (afterImport.json as { document: { nodes: unknown[] } }).document.nodes
        .length,
      1,
    )

    const deleted = await req('DELETE', `/api/mindmaps/${map.id}`)
    assert.equal(deleted.status, 204)
    const gone = await req('GET', `/api/mindmaps/${map.id}`)
    assert.equal(gone.status, 404)
  }

  // ---- correct hours on a time log (Log tab) ----
  {
    const created = await req('POST', '/api/tasks', {
      title: 'Log correct',
      category: 'Daily',
      addToToday: true,
      date,
    })
    assert.equal(created.status, 201)
    const task = created.json as { id: string }

    const start = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'start',
    })
    assert.equal(start.status, 200)
    await new Promise((r) => setTimeout(r, 40))
    const stop = await req('PATCH', `/api/day-entries/${task.id}`, {
      date,
      timerAction: 'stop',
    })
    assert.equal(stop.status, 200)
    const stopped = stop.json as { entry: { hours: number } }
    assert.ok(stopped.entry.hours > 0)

    const hist = await req('GET', '/api/history?limit=10')
    assert.equal(hist.status, 200)
    const logs = (hist.json as { logs: Array<{ id: string; taskId: string; hours: number }> })
      .logs
    const log = logs.find((l) => l.taskId === task.id)
    assert.ok(log, 'expected a time log for the task')

    const patched = await req('PATCH', `/api/history/${log!.id}`, {
      hours: 1.25,
    })
    assert.equal(patched.status, 200)
    assert.equal((patched.json as { hours: number }).hours, 1.25)

    const list = await req('GET', `/api/tasks?date=${date}`)
    assert.equal(list.status, 200)
    const row = (
      list.json as { tasks: Array<{ id: string; entry: { hours: number } | null }> }
    ).tasks.find((t) => t.id === task.id)
    assert.ok(row?.entry)
    assert.equal(Number(row!.entry!.hours.toFixed(2)), 1.25)

    const bad = await req('PATCH', `/api/history/${log!.id}`, {
      hours: 'nope',
    })
    assert.equal(bad.status, 400)

    const missing = await req('PATCH', '/api/history/missing-id', {
      hours: 1,
    })
    assert.equal(missing.status, 404)
  }

  // ---- Projects on All only when day_entry exists ----
  {
    const parked = (await req('POST', '/api/tasks', {
      title: 'Parked project work',
      category: 'Projects',
      projectTag: 'Marketing',
      addToToday: false,
      date,
    })).json as { id: string }

    const allBefore = await req('GET', `/api/tasks?date=${date}`)
    assert.equal(allBefore.status, 200)
    assert.equal(
      (allBefore.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === parked.id,
      ),
      false,
      'Projects without day_entry must not appear on All',
    )

    const projectsChip = await req(
      'GET',
      `/api/tasks?date=${date}&category=Projects`,
    )
    assert.equal(projectsChip.status, 200)
    assert.ok(
      (projectsChip.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === parked.id,
      ),
      'Projects chip still lists parked project tasks',
    )

    const scheduled = await req('POST', `/api/tasks/${parked.id}/schedule`, {
      date,
    })
    assert.equal(scheduled.status, 200)

    const allAfter = await req('GET', `/api/tasks?date=${date}`)
    assert.ok(
      (allAfter.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === parked.id,
      ),
      'Scheduled Projects task appears on All',
    )

    const pulled = (await req('POST', '/api/tasks', {
      title: 'Pulled project today',
      category: 'Projects',
      projectTag: 'Marketing',
      addToToday: true,
      date,
    })).json as { id: string }
    const allPulled = await req('GET', `/api/tasks?date=${date}`)
    assert.ok(
      (allPulled.json as { tasks: Array<{ id: string }> }).tasks.some(
        (t) => t.id === pulled.id,
      ),
      'addToToday Projects task appears on All',
    )
  }

  // ---- page bootstraps: today / pulse / analytics ----
  {
    await req('POST', '/api/habits', { title: 'Morning walk' })
    await req('POST', '/api/notes', {
      title: 'Bootstrap note',
      body: 'One call should include this',
    })

    const today = await req('GET', `/api/today?date=${date}`)
    assert.equal(today.status, 200)
    const todayBody = today.json as {
      date: string
      tasks: unknown[]
      stats: { date: string; today: { total: number } }
      habits: { habits: Array<{ title: string }> }
      week: { date: string; days: unknown[]; streak: number }
    }
    assert.equal(todayBody.date, date)
    assert.ok(Array.isArray(todayBody.tasks))
    assert.equal(todayBody.stats.date, date)
    assert.ok(todayBody.habits.habits.some((h) => h.title === 'Morning walk'))
    assert.equal(todayBody.week.days.length, 7)
    assert.equal((today.json as { notes?: unknown }).notes, undefined)

    const master = await req('GET', `/api/today?date=${date}&master=1`)
    assert.equal(master.status, 200)
    const masterBody = master.json as Record<string, unknown>
    assert.ok(Array.isArray(masterBody.tasks))
    assert.ok(masterBody.stats)
    assert.equal(masterBody.habits, undefined)
    assert.equal(masterBody.week, undefined)
    assert.equal(masterBody.notes, undefined)

    const projects = await req(
      'GET',
      `/api/today?date=${date}&category=Projects`,
    )
    assert.equal(projects.status, 200)
    const projectsBody = projects.json as Record<string, unknown>
    assert.ok(projectsBody.stats)
    assert.equal(projectsBody.notes, undefined)
    assert.equal(projectsBody.habits, undefined)
    assert.equal(projectsBody.week, undefined)

    const pulse = await req('GET', `/api/today/pulse?date=${date}`)
    assert.equal(pulse.status, 200)
    const pulseBody = pulse.json as {
      stats: { date: string; streak: number }
      week: { date: string; days: unknown[]; streak: number }
    }
    assert.equal(pulseBody.stats.date, date)
    assert.equal(pulseBody.week.days.length, 7)
    assert.equal(pulseBody.stats.streak, pulseBody.week.streak)

    const analytics = await req('GET', `/api/analytics?date=${date}`)
    assert.equal(analytics.status, 200)
    const analyticsBody = analytics.json as {
      stats: { insight?: { rangeStart: string } }
      habitsProgress: { days: number; habits: unknown[] }
    }
    assert.ok(analyticsBody.stats.insight?.rangeStart)
    assert.equal(analyticsBody.habitsProgress.days, 28)
    assert.ok(Array.isArray(analyticsBody.habitsProgress.habits))
  }

  // ---- Now: pin checklist items + reminders due today ----
  {
    const created = await req('POST', '/api/tasks', {
      title: 'Now parent',
      category: 'Daily',
      addToToday: true,
      date,
      subtasks: ['Pinned item', 'Leave unpinned'],
    })
    assert.equal(created.status, 201)
    const parent = created.json as {
      id: string
      subtasks: Array<{ id: string; title: string; pinned: boolean }>
    }
    assert.equal(parent.subtasks.length, 2)
    assert.equal(parent.subtasks[0].pinned, false)

    const pin = await req('PATCH', `/api/subtasks/${parent.subtasks[0].id}`, {
      pinned: true,
    })
    assert.equal(pin.status, 200)
    assert.equal((pin.json as { pinned: boolean }).pinned, true)

    const remOverdue = await req('POST', '/api/reminders', {
      title: 'Overdue call',
      dueDate: '2026-08-01',
      dueTime: '09:00',
    })
    assert.equal(remOverdue.status, 201)
    const remToday = await req('POST', '/api/reminders', {
      title: 'Today note',
      dueDate: date,
    })
    assert.equal(remToday.status, 201)
    const remFuture = await req('POST', '/api/reminders', {
      title: 'Later',
      dueDate: '2026-12-01',
    })
    assert.equal(remFuture.status, 201)

    const nowPage = await req('GET', `/api/now?date=${date}`)
    assert.equal(nowPage.status, 200)
    const nowBody = nowPage.json as {
      date: string
      items: Array<{ id: string; pinned: boolean; done: boolean; taskTitle: string }>
      reminders: Array<{ id: string; title: string }>
    }
    assert.equal(nowBody.date, date)
    assert.equal(nowBody.items.length, 1)
    assert.equal(nowBody.items[0].id, parent.subtasks[0].id)
    assert.equal(nowBody.items[0].taskTitle, 'Now parent')
    assert.ok(!nowBody.items.some((item) => item.id === parent.subtasks[1].id))
    assert.deepEqual(
      nowBody.reminders.map((r) => r.title),
      ['Overdue call', 'Today note'],
    )

    const donePin = await req('PATCH', `/api/subtasks/${parent.subtasks[0].id}`, {
      done: true,
      date,
    })
    assert.equal(donePin.status, 200)
    const nowAfterDone = await req('GET', `/api/now?date=${date}`)
    const afterDone = nowAfterDone.json as { items: Array<{ id: string }> }
    assert.ok(!afterDone.items.some((item) => item.id === parent.subtasks[0].id))

    const exported = await req('GET', '/api/export')
    assert.equal(exported.status, 200)
    const backup = exported.json as {
      subtasks: Array<{ pinned?: number }>
      reminders: Array<{ title: string }>
    }
    assert.ok(backup.subtasks.some((s) => Number(s.pinned) === 1))
    assert.ok(backup.reminders.some((r) => r.title === 'Today note'))
  }

  console.log('api tests passed')
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
