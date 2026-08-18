# Now day pulse and Reminders inbox

Related: [[IMPLEMENTATION_PLAN]].

## Call

Now is the same-day work surface. The right column shows how close the selected items are to 100%. Reminders that are not due on the viewed date live in the Reminders tab.

## Locked rules

- Now reminders: `dueDate === viewed date` (open in the list; done tucked under Show all).
- Pulse counts pinned checklist items (including done-as-of-date), all habits that day, and reminders due that date (including done). Equal weight. Unpinned Today tasks are not in the ring.
- Overdue reminders do not appear on Now. The pulse can show “N still open” and open the Reminders tab.
- When-chip: date required (defaults to the viewed day), time optional. Another date saves and leaves Now.
- Empty pulse is not 0%. 100% is a quiet “That’s the day”.

Pulse math lives in [`server/now-progress.ts`](../server/now-progress.ts) for the API and [`src/features/now-progress.ts`](../src/features/now-progress.ts) for the client. Do not import `src/` from `server/` — Vercel’s function cannot resolve that.

## Acceptance

- AC1: Overdue and later reminders are absent from `GET /api/now` for date D.
- AC2: Completing a pinned item hides it from the Now list and increments the pulse checklist count.
- AC3: Completing a due-today reminder tucks it under Show all and increments the pulse reminder count.
- AC4: Changing a reminder’s date off D removes it from Now and toasts the saved date.
- AC5: Reminders tab lists Overdue / This day / Later / Done.
- AC6: Lint, unit, API tests, and `npm run build` pass.
