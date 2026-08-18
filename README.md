# Daily & Weekly Progress Hub

Local React todo / progress tracker modeled after the [Daily Tracker](https://example.com/daily-tracker) spreadsheet.

## Product freeze (core)

Primary surfaces: **Now / Today / Master**, cadence visibility (All shows period tasks on cadence days, with capped incomplete overflow until done or the next cadence day), day complete, hours/timers, checklists, day goal, **This week** progress rail (Mon–Sun bars + completion ring), **Notes** (task notes + standalone notes), analytics, JSON **export + import**.

Secondary (demoted): **Board** (Kanban) — column **roles** (`backlog` | `doing` | `done` | `custom`) are the sole workflow authority; list `sort_order` and board `board_sort` are independent. **Maps** — personal canvas (ideas, stickies, frames, colors, undo); not a collaborative Miro board (no freehand or multiplayer); fully isolated from tasks.

Notes: overlay drawer from the right (does not shove the main track). Minimal rich text via TipTap (headings, emphasis, lists, checklist, links) — not Google Docs parity. Dedicated Notes tab + dashboard Notes panel list every task note and standalone note.

## Mobile + PWA

Hybrid responsive shell for phones (≤900px): compact **Progress Hub** brand row + short nav labels (Dates / Stats / Log), denser spacing, 2-column stats, full-bleed notes, full-screen modals.

Installable as a **PWA** on the hosted HTTPS URL (service worker is production-only). The worker caches the app shell only — `/api` is network-only. Offline does not sync tasks; reconnect to use the API.

On iPhone (Safari, not in-app browsers):

1. Open `https://progressive-hub.vercel.app`.
2. Share → **Add to Home Screen**.
3. Launch the icon. First sign-in uses email. Free-tier Supabase sends a **Sign in link**, not a 6-digit code. Long-press the link → **Copy** → paste it in the app. Do not tap the link (that opens Safari and burns the token). Google sign-in stays on regular Safari tabs.

Phone on the same Wi-Fi for local UI only: `npm run dev` binds to LAN (`host: true`). Open `http://<your-lan-ip>:5173`. Add to Home Screen needs the Vercel deploy.

## Features

- **Full-screen workspace** — sticky header, date navigation, category filters
- **Now** — default landing, centered reading column. Daily habits, pinned checklist items, and reminders due today (plus overdue incomplete reminders). Completed habits tuck under Show all. No week rail, filters, or stats on this page. On a phone, pin and timer wrap under the title.
- **Today / Master** — complete tasks, live timers, hours, day goal
- **Pin to Now** — pin icon beside the checklist timer; pinned items stay until you unpin. Completing hides them from Now for that day. Drag to reorder on Now; that order is separate from the parent task’s checklist.
- **Reminders** — title + optional time, added on Now. No phone notifications in this version.
- **Focus Mode** — Play on Today opens a bare session view (title, checklist item, Until break countdown, Time worked); Leave keeps the timer, Stop ends it; gentle beep/notification when the countdown hits zero
- **Checklist focus timers** — start/stop the timer on a checklist item; time locks to that item; parent task shows the sum; HOURS LOGGED shows a session strip (hover for task + checklist)
- **Checklists (subtasks)** — visible by default under the parent row; collapse via chevron; compact nested list; idle timers shrink to a play icon on phones
- **Task notes** — small icon on the parent row opens the overlay rich-text drawer (resizable on desktop; full-screen on phone); main list stays put
- **Notes hub** — scrollable Notes panel under Progress; Notes tab with search, project/priority/source/pinned filters (saved in the browser), two-level arrange (Group by → Then sort within sections), pin/unpin from the list or an open standalone note; create standalone notes from either surface
- **This week progress** — Mon–Sun bars, completion ring, streak, vs-last-week delta; click a day to jump the dashboard date
- **Dense list rows** — Linear-style ~32px rows on desktop; larger hit targets on phone; quiet click-to-edit metadata menus, green done/timer accents
- **Board** (secondary) — drag-and-drop cards; role-driven status; independent card order; horizontal scroll on narrow screens
- **Maps** (secondary) — many named boards; ideas, stickies, frames, colors, undo/redo; autosaved; personal only (no freehand / collaboration)
- **All Dates / Analytics / History**
- **Export / Import** — full JSON backup and replace-restore (includes standalone notes, habits, mindmaps, reminders)

Data is stored locally in PGlite (`data/pglite`) during `npm run dev`, or in the **progressive-hub** Supabase Postgres database when `DATABASE_URL` is set.

## Hosted (Vercel + new Supabase project)

This app uses a **new** Supabase project (`progressive-hub`), not Actofy auth.

1. In the new project SQL editor, run [`supabase/migrations/20260817120000_init_tracker.sql`](supabase/migrations/20260817120000_init_tracker.sql), then [`supabase/migrations/20260818010000_now_pins_reminders.sql`](supabase/migrations/20260818010000_now_pins_reminders.sql) (pins + reminders), then [`supabase/migrations/20260818020000_now_pin_sort.sql`](supabase/migrations/20260818020000_now_pin_sort.sql) (Now drag order). Existing projects need the later files they have not already run.
2. Authentication → Providers → Google: paste the new Google OAuth client ID and secret.
3. Authentication → Providers → **Email**: enable. Turn on email OTP / magic-link codes (6-digit). The home-screen app signs in this way so iOS never leaves for Safari.
4. Add authorized redirect URI in Google Cloud: `https://your-project-ref.supabase.co/auth/v1/callback`.
5. Authentication → URL configuration:
   - **Site URL:** `https://progressive-hub.vercel.app` (not `http://localhost:3000`)
   - **Redirect URLs:** `https://progressive-hub.vercel.app/**` and `http://localhost:5173/**`
6. GitHub repo is this app root (`vineetsgr07/todo-app`). Vercel project **progressive-hub** deploys on every push to `main`. Production: `https://progressive-hub.vercel.app`. Env vars:

| Env | Where |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `https://your-project-ref.supabase.co` + publishable key |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Same values (server JWT check) |
| `DATABASE_URL` | Settings → Database → URI (transaction pooler, port 6543, `?sslmode=require`) |
| `AUTH_ALLOWED_EMAILS` | Your Gmail(s), comma-separated |
| `TRACKER_SKIP_SEED` | `1` |

7. After first deploy, add the Vercel URL to Google origins and Supabase redirect URLs.
8. Sign in (Google in Safari, or email code from the home-screen icon), then Import a JSON backup from local Export if you want existing tasks.

## Run

```bash
npm install
npm run dev
```

Opens:

- UI: http://localhost:5173
- API: http://localhost:8787

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | API + Vite together |
| `npm run server` | API only |
| `npm run client` | Vite only |
| `npm run build` | Production frontend build (includes PWA assets) |
| `npm test` | Cadence + API + notes + week + progress-copy + notes-list + drawer width + focus + now/reminders |

## API (local)

- `GET/POST /api/tasks`
- `PATCH/DELETE /api/tasks/:id`
- `PATCH /api/tasks/reorder` — Today/Master list drag order (`sort_order`)
- `PATCH /api/tasks/:id/subtasks/reorder` — checklist drag order
- `POST /api/tasks/:id/subtasks`
- `PATCH/DELETE /api/subtasks/:id` — checklist title/done/pin
- `GET /api/now?date=` — today’s habits, pinned open checklist items, and reminders due that day (and overdue)
- `PATCH /api/now/items/reorder` — Now pinned-item drag order (`pin_sort`; does not change checklist `position`)
- `GET/POST /api/reminders` · `PATCH/DELETE /api/reminders/:id`
- `GET /api/board` — columns + tasks (ordered by `board_sort`)
- `POST /api/board/columns` — optional `role`
- `PATCH /api/board/columns/:id` — name/color/`role`
- `PATCH /api/board/columns/reorder`
- `DELETE /api/board/columns/:id` — cards move to Backlog role column
- `PATCH /api/board/move` — board drag persistence (`board_sort` only)
- `PATCH /api/day-entries/:taskId` — complete, hours, start/stop timer
- `GET/PUT /api/goal`
- `GET /api/today?date=&category=&master=` — Today/Master page bootstrap (tasks + stats; habits/week when those panels mount)
- `GET /api/today/pulse?date=` — stats + week after a Today mutation
- `GET /api/analytics?date=` — Analytics bootstrap (insight stats + 28-day habits progress)
- `GET /api/stats`
- `GET /api/stats/progress?date=&range=day|week|month` — cadence-honest completion series (Analytics)
- `GET /api/stats/week?date=` — Mon–Sun week progress for the dashboard rail
- `GET /api/notes` — unified note list (`q`, `project`, `priority`, `source`, `sort`, `scope=recent|older|all`, `limit` default 50)
- `GET /api/notes/:source/:id` — full note body (`source` = `task` | `note`)
- `POST /api/notes` · `PATCH/DELETE /api/notes/:id` — standalone notes
- `POST /api/notes/task/:id/clear` — clear a task’s notes field
- `GET /api/history`
- `GET /api/dates`
- `GET/POST /api/habits` · `PATCH /api/habits/reorder` · `PATCH/DELETE /api/habits/:id` · `PUT /api/habits/:id/entry`
- `GET /api/habits/progress?days=`
- `GET/POST /api/mindmaps` — list metadata / create empty board
- `GET/PATCH/DELETE /api/mindmaps/:id` — full document (nodes, edges, viewport)
- `GET /api/export`
- `POST /api/import` — replace-all restore from export JSON
