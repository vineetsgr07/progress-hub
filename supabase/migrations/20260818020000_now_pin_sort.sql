-- Now view: independent sort order for pinned checklist items.
-- Does not change parent-task checklist position.

ALTER TABLE subtasks ADD COLUMN IF NOT EXISTS pin_sort INTEGER NOT NULL DEFAULT 0;

UPDATE subtasks s
SET pin_sort = r.n
FROM (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) - 1)::int AS n
  FROM subtasks
  WHERE pinned = 1
) r
WHERE s.id = r.id AND s.pinned = 1;

CREATE INDEX IF NOT EXISTS idx_subtasks_pin_sort ON subtasks(pinned, pin_sort);
