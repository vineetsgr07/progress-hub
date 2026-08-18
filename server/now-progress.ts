export type NowCount = {
  completed: number
  total: number
}

export type NowProgress = {
  checklist: NowCount
  habits: NowCount
  reminders: NowCount
  percent: number
  overdueOpen: number
}

export function computeNowProgress(parts: {
  checklist: NowCount
  habits: NowCount
  reminders: NowCount
  overdueOpen: number
}): NowProgress {
  const completed =
    parts.checklist.completed + parts.habits.completed + parts.reminders.completed
  const total = parts.checklist.total + parts.habits.total + parts.reminders.total
  return {
    checklist: parts.checklist,
    habits: parts.habits,
    reminders: parts.reminders,
    percent: total ? Math.round((completed / total) * 100) : 0,
    overdueOpen: Math.max(0, parts.overdueOpen),
  }
}

export function nowProgressFromLists(input: {
  checklistCompleted: number
  checklistTotal: number
  habits: Array<{ completed: boolean }>
  remindersDue: Array<{ done: boolean }>
  overdueOpen: number
}): NowProgress {
  return computeNowProgress({
    checklist: {
      completed: input.checklistCompleted,
      total: input.checklistTotal,
    },
    habits: {
      completed: input.habits.filter((h) => h.completed).length,
      total: input.habits.length,
    },
    reminders: {
      completed: input.remindersDue.filter((r) => r.done).length,
      total: input.remindersDue.length,
    },
    overdueOpen: input.overdueOpen,
  })
}
