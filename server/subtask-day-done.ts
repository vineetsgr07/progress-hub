/** Calendar day from TEXT / DATE / timestamptz (same idea as isoDateKey). */
export const SDS_DAY_KEY_SQL = `substr(cast(sds.date as text), 1, 10)`

/**
 * Daily checklist done as of a viewed date:
 * latest subtask_day_state on or before that date, else subtasks.done.
 * Bind the viewed date as the first `?` in this fragment.
 */
export const DAILY_DONE_AS_OF_SQL = `COALESCE(
  (SELECT sds.done FROM subtask_day_state sds
   WHERE sds.subtask_id = s.id AND ${SDS_DAY_KEY_SQL} <= ?
   ORDER BY ${SDS_DAY_KEY_SQL} DESC LIMIT 1),
  s.done,
  0
)`
