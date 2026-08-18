# Load latency (2026-08-18)

What shipped, what we refused, how to re-measure.

## Shipped

1. **`GET /api/now` batching** — `loadNowPage` loads pinned parents with one `IN` query + existing `mapTasks` (entries, subtasks, hours). Reminders and habits run in `Promise.all`. Same pin filter: skip missing parent, skip `!pinned || done`.
2. **Lazy views** — Maps, notes drawer, notes hub, board, analytics, and task detail (BlockNote) load with `React.lazy`. Now + Today/Master stay eager.
3. **Now soft remount** — module-level `{ date, page }` cache. Returning to Now for the same date paints immediately and refetches in the background.

## Refused

- **`pool.max > 1`** — Vercel isolate + Supabase transaction pooler (port 6543). Tests lock `max: 1`.
- **React Query / SWR / IndexedDB** — page APIs + soft refresh already exist.
- **Analytics rewrite, stripping `notes` from task lists, keep-all-tabs-mounted.**

## Re-measure

- `npm run test:api` — Now pin / reorder / done cases.
- `npm run test:now-copy` — cache helpers stay in `NowView.tsx`.
- `npm run build` — `dist/assets` should have separate Maps / notes-editor chunks; main should not contain `@xyflow` or `@blocknote`.
- Screen: cold Now; Now → Today → Now (no empty skeleton if that date was loaded); open a note; open Maps.
- Hosted: `https://progressive-hub.vercel.app` after `main` deploy.
