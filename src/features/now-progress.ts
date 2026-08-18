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

export const EMPTY_NOW_PROGRESS: NowProgress = computeNowProgress({
  checklist: { completed: 0, total: 0 },
  habits: { completed: 0, total: 0 },
  reminders: { completed: 0, total: 0 },
  overdueOpen: 0,
})

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

export function nowProgressTotals(progress: NowProgress): {
  completed: number
  total: number
} {
  return {
    completed:
      progress.checklist.completed +
      progress.habits.completed +
      progress.reminders.completed,
    total:
      progress.checklist.total + progress.habits.total + progress.reminders.total,
  }
}
