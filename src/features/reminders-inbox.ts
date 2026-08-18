import type { Reminder } from '../types'

export type ReminderInbox = {
  overdue: Reminder[]
  today: Reminder[]
  later: Reminder[]
  done: Reminder[]
}

function sortReminders(items: Reminder[]): Reminder[] {
  return [...items].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    return a.id.localeCompare(b.id)
  })
}

export function groupReminderInbox(
  items: Reminder[],
  viewDate: string,
): ReminderInbox {
  return {
    overdue: sortReminders(
      items.filter((item) => !item.done && item.dueDate < viewDate),
    ),
    today: sortReminders(
      items.filter((item) => !item.done && item.dueDate === viewDate),
    ),
    later: sortReminders(
      items.filter((item) => !item.done && item.dueDate > viewDate),
    ),
    done: sortReminders(items.filter((item) => item.done)),
  }
}
