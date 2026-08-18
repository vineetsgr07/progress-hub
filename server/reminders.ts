export type ReminderRow = {
  id: string
  title: string
  dueDate: string
  dueTime: string | null
  done: boolean
  position: number
  createdAt: string
  updatedAt: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isIsoDate(value: string): boolean {
  return DATE_RE.test(value)
}

export function parseDueTime(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const raw = String(value).trim()
  if (!TIME_RE.test(raw)) return undefined
  return raw
}

/** Incomplete reminders due on or before the viewed day. */
export function isPendingReminder(
  reminder: Pick<ReminderRow, 'dueDate' | 'done'>,
  viewDate: string,
): boolean {
  if (reminder.done) return false
  return reminder.dueDate <= viewDate
}

/** Timed items first (by time), then untimed; stable by position then id. */
export function sortReminders(items: ReminderRow[]): ReminderRow[] {
  return [...items].sort((a, b) => {
    const aTimed = Boolean(a.dueTime)
    const bTimed = Boolean(b.dueTime)
    if (aTimed !== bTimed) return aTimed ? -1 : 1
    if (a.dueTime && b.dueTime && a.dueTime !== b.dueTime) {
      return a.dueTime.localeCompare(b.dueTime)
    }
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    if (a.position !== b.position) return a.position - b.position
    return a.id.localeCompare(b.id)
  })
}

export function pendingRemindersForDate(
  items: ReminderRow[],
  viewDate: string,
): ReminderRow[] {
  return sortReminders(items.filter((item) => isPendingReminder(item, viewDate)))
}

export function mapReminder(row: Record<string, unknown>): ReminderRow {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    dueDate: String(row.due_date ?? ''),
    dueTime: row.due_time == null || row.due_time === '' ? null : String(row.due_time),
    done: Number(row.done) === 1,
    position: Number(row.position ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}
