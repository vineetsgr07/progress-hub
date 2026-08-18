-- Now view: pin checklist items + thin reminders list.
-- RLS on; no anon/authenticated policies. The Express API uses DATABASE_URL.

ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS pinned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  due_time TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_pinned ON subtasks(pinned);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE reminders FROM anon, authenticated;
