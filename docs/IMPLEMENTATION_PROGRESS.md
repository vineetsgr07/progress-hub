# Implementation progress — Today All Projects declutter

- **Plan path:** `todo-app/docs/IMPLEMENTATION_PLAN.md`
- **Branch:** `main`
- **Started:** 2026-08-08
- **Finished:** 2026-08-08
- **Baseline:** Cadence always-on for Daily + Projects; BlockNote plan complete (unrelated)
- **Pre-existing failures:** none for cadence/api; lint had pre-existing hook warnings
- **Pre-existing user changes:** dirty submodules left untouched

## Phases

| Phase | Status | Notes |
|---|---|---|
| 1 Docs | done | Plan + progress |
| 2 Cadence helper + tests | done | `hasDayEntry` for Projects on All |
| 3 API All + day-progress | done | Exclude parked Projects; join day_entries |
| 4 Empty-state copy | done | `task-copy` + App |
| 5 Validate | done | cadence, api, full suite, build, live API smoke |

## Acceptance checklist

| ID | Status | Evidence |
|---|---|---|
| AC1 | done | Unit + api.test + live smoke: 7 parked Projects off All |
| AC2 | done | schedule / addToToday api.test; live All Projects all have `entry` |
| AC3 | done | api.test Projects chip; live chip=9 |
| AC4 | done | existing cadence/api period tests still pass |
| AC5 | done | `computeDayProgress` passes `hasDayEntry`; week-progress tests pass |
| AC6 | done | `emptyTodayTitle` / `emptyTodayBody` in `task-copy.ts` |
| AC7 | done | lint (pre-existing warnings only), full `npm test`, `npm run build` |

## Files changed

- `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_PROGRESS.md`
- `server/cadence.ts`, `server/cadence.test.ts`
- `server/app.ts` — All query excludes parked Projects
- `server/day-progress.ts` — `hasDayEntry` into `visibleOnToday`
- `server/api.test.ts` — Projects All gate cases
- `src/features/task-copy.ts`, `src/App.tsx` — empty copy

## Commands executed

- `npm run test:cadence` — pass
- `npm run test:api` — pass
- `npm run lint` — pass (pre-existing warnings only)
- `npm run build` — pass
- `npm test` — pass
- Live API smoke on `localhost:8787` — SMOKE_OK

## Test results

- Cadence: Projects without entry hidden on All; with entry / Projects chip shown
- API: park → absent on All → schedule → present; addToToday present; chip lists parked
- Full suite: all scripts green

## Runtime evidence

- Date `2026-08-08`: All total=8 (Daily=2, Projects-on-All=2); Projects chip=9; parked_not_on_all=7
- Sample parked:Instagram/TikTok, SEO, UGC…
- All Projects on All had non-null `entry`

## Decisions and deviations

- Gate = day_entry only (doing/done already `ensureDayEntry`)
- No default chip change to Daily; All is sparse enough after this change
- No due-date field

## Unresolved risks

- Creating Projects on Today with `addToToday` still lands on All (intentional)
- Historical day_entries from accidental timers could still surface a project on that date

## Blockers

- None

## Next eligible phase

- None — completion gate satisfied
