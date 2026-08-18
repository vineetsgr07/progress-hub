# Today All: Projects off always-on

## Call

Stop auto-listing every `Projects` task on Today **All**. Keep Daily always-on; include Projects on All only when they have a `day_entry` for that date (schedule, start, complete, or create with add-to-today). Projects chip still lists all project tasks. No due-date field.

## User job

See a short Today commitment list — daily work plus period tasks that are due — without the full project backlog mixed in.

## Why

- `visibleOnToday` treats `Projects` like `Daily` (always true) → All is cluttered.
- Projects already have a dedicated chip/board; Today All should be commitments, not the park lot.
- `day_entry` + existing `/schedule` is the pull-to-today seam; starting/completing already calls `ensureDayEntry`.

## Non-goals

- Due-date / scheduled-for schema
- Changing Weekly/Monthly cadence or overflow
- Defaulting the chip away from All (All becomes sparse enough)
- Hiding Projects that were explicitly pulled onto the day

## Decisions (locked)

| Topic | Choice |
|---|---|
| Gate | `hasDayEntry` for that calendar date |
| Own chip | Projects chip unchanged (all masters in category) |
| Stats | Same rule via `computeDayProgress` / `visibleOnToday` |
| Copy | Empty state mentions Projects chip + schedule from Master |

## Slice

1. Docs (`IMPLEMENTATION_PLAN.md` / `IMPLEMENTATION_PROGRESS.md`)
2. `visibleOnToday` + cadence unit tests (`hasDayEntry`)
3. `GET /api/tasks` All branch + `day-progress` wire-up
4. Empty-state copy in `task-copy.ts` / App
5. Lint, `test:cadence`, `test:api`, full `npm test`, build, API smoke

## Acceptance

- AC1: Projects without a day entry for D do not appear on Today All for D
- AC2: Projects with a day entry for D appear on All; schedule / doing / done / addToToday still create that entry
- AC3: Projects chip still lists all Projects tasks
- AC4: Daily + cadence period behaviour unchanged
- AC5: Day progress / stats totals match All visibility
- AC6: Empty copy points to Projects or Master schedule without jargon
- AC7: Lint, cadence + api tests, full `npm test`, and `npm run build` pass
