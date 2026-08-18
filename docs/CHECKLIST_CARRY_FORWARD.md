# Daily checklist carry-forward

## Call

Completed Daily **checklist items** stay marked on later days. The parent Daily’s day-complete checkbox still resets each morning.

## Why

- Daily task checklists are multi-day punch lists; Habits already reset daily.
- One source of truth: latest `subtask_day_state` on or before the viewed date, else `subtasks.done`.
- Parent `day_entries.completed` stays day-scoped.

## Non-goals

- Persisting parent Daily complete
- Per-task reset vs sticky setting
- Changing Habits daily reset
- Auto-completing the parent when all items are done

## Acceptance

- AC1: Check an item on day A → still done on day B
- AC2: Uncheck on day C → undone on C and later; day A still done
- AC3: Parent Daily complete on A does not complete the parent on B
- AC4: Weekly checklist permanence unchanged

## Progress

- **Finished:** 2026-08-18
- Read seam: `DAILY_DONE_AS_OF_SQL` in `server/subtask-day-done.ts`, used by `loadSubtasks`, `mapTasks`, stats; dates compared as `YYYY-MM-DD` so timestamp-shaped rows still match
- Write seam: Daily PATCH writes `subtasks.done` and `subtask_day_state`
- Tests: persist / uncheck / snapshot / parent reset; legacy day-state-only write still done the next day
