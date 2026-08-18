/** Table DDL shared by PGlite (local/tests) and used as the migrate() baseline. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Daily',
  project_tag TEXT NOT NULL DEFAULT 'Work',
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'todo',
  is_master INTEGER NOT NULL DEFAULT 1,
  cadence_weekday INTEGER,
  cadence_month_day INTEGER,
  column_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  board_sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS day_entries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  timer_started_at TEXT,
  timer_subtask_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (task_id, date)
);

CREATE TABLE IF NOT EXISTS daily_goals (
  date TEXT PRIMARY KEY,
  goal TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  hours DOUBLE PRECISION NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  subtask_id TEXT
);

CREATE TABLE IF NOT EXISTS board_columns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#2b63e3',
  is_terminal INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'custom',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS subtask_day_state (
  subtask_id TEXT NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subtask_id, date)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS standalone_notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  project_tag TEXT NOT NULL DEFAULT 'Personal',
  priority TEXT NOT NULL DEFAULT 'Medium',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_entries (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (habit_id, date)
);

CREATE TABLE IF NOT EXISTS mindmaps (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  document TEXT NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_day_entries_date ON day_entries(date);
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
CREATE INDEX IF NOT EXISTS idx_time_logs_date ON time_logs(date);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtask_day_state_date ON subtask_day_state(date);
CREATE INDEX IF NOT EXISTS idx_board_columns_pos ON board_columns(position);
CREATE INDEX IF NOT EXISTS idx_standalone_notes_updated ON standalone_notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_habit_entries_date ON habit_entries(date);
CREATE INDEX IF NOT EXISTS idx_habits_sort ON habits(sort_order);
CREATE INDEX IF NOT EXISTS idx_mindmaps_sort ON mindmaps(sort_order);
CREATE INDEX IF NOT EXISTS idx_subtasks_pinned ON subtasks(pinned);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_date);
`
