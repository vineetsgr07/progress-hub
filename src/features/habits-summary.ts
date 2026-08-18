import { HABITS_COLLAPSED_KEY, habitsCopy } from './habits-copy'

/** Header summary for today’s habit check-ins. */
export function habitSummaryLabel(completed: number, total: number): string {
  return habitsCopy.summary(completed, total)
}

export function habitDaySummary(
  habits: Array<{ completed: boolean }>,
): { completed: number; total: number; percent: number } {
  const total = habits.length
  let completed = 0
  for (const h of habits) {
    if (h.completed) completed += 1
  }
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  return { completed, total, percent }
}

/** Remember collapse preference. Default expanded. */
export function readHabitsCollapsed(storage: Storage = localStorage): boolean {
  try {
    const raw = storage.getItem(HABITS_COLLAPSED_KEY)
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

export function writeHabitsCollapsed(
  collapsed: boolean,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(HABITS_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}
