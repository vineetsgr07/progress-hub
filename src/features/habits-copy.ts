export const HABITS_COLLAPSED_KEY = 'todo-habits-collapsed'

export const habitsCopy = {
  title: 'Habits',
  empty: 'Add habits you want to check off each day. They reset every morning — past check-ins stay saved.',
  loading: 'Loading habits…',
  error:
    'Couldn’t load habits. Check that the app server is running, then try again.',
  retry: 'Retry',
  addPlaceholder: '+ Add habit',
  add: 'Add',
  addAria: 'Add a new habit',
  archive: 'Archive',
  rename: 'Rename',
  renameHint: 'Double-click to rename',
  renameAria: (title: string) => `Rename ${title}`,
  dragAria: (title: string) => `Drag to reorder ${title}`,
  dailyReset: 'Resets daily',
  expand: 'Show habits',
  collapse: 'Hide habits',
  viewHistory: 'Trends',
  viewHistoryAria: 'Open habit trends in Analytics',
  summary: (completed: number, total: number) =>
    total > 0 ? `${completed} of ${total}` : '',
  progressAria: (completed: number, total: number) =>
    total > 0
      ? `Habits progress: ${completed} of ${total} done today`
      : 'No habits yet',
  togglePanelAria: (expanded: boolean, completed: number, total: number) => {
    const progress =
      total > 0 ? `, ${completed} of ${total} done` : ''
    return expanded
      ? `Hide habits${progress}`
      : `Show habits${progress}`
  },
  rowAria: (title: string, completed: boolean) =>
    completed ? `${title}, done` : `${title}, not done`,
  toggleAria: (title: string, completed: boolean) =>
    completed ? `Mark ${title} as not done` : `Mark ${title} as done`,
} as const

export const habitsHistoryCopy = {
  title: 'Habits',
  subtitle:
    'See which habits need a check-in — then open Today and clear them.',
  loading: 'Loading habit history…',
  error:
    'Couldn’t load habit history. Check that the app server is running, then try again.',
  retry: 'Retry',
  empty: 'No habits yet. Add one on Today to start tracking.',
  range28: '28 days',
  range56: '56 days',
  rangeAria: 'History range',
  streak: (n: number) => (n > 0 ? `${n}-day streak` : 'No streak'),
  rate: (completed: number, total: number, percent: number) =>
    total > 0 ? `${completed} of ${total} · ${percent}%` : 'Not tracked yet',
  cellAria: (title: string, date: string, completed: boolean, tracked: boolean) => {
    if (!tracked) return `${title} on ${date}: not tracked yet`
    return completed
      ? `${title} on ${date}: done`
      : `${title} on ${date}: missed`
  },
  legendDone: 'Done',
  legendMissed: 'Missed',
  legendFuture: 'Not tracked',
  overviewAria: 'Habit progress overview',
  overviewRate: 'Completion',
  overviewRateHint: (completed: number, total: number) =>
    total > 0 ? `${completed} of ${total} check-ins` : 'No check-ins yet',
  overviewStreak: 'Best streak',
  overviewStreakValue: (n: number) => (n > 0 ? `${n} days` : '—'),
  overviewPerfect: 'Perfect days',
  overviewPerfectHint: (perfect: number, active: number) =>
    active > 0 ? `${perfect} of ${active} days` : 'No days yet',
  overviewHabits: (n: number) => (n === 1 ? '1 habit' : `${n} habits`),
  chartTitle: 'Daily progress',
  chartSubtitle: 'Share of habits done each day — tap a day to open it',
  chartAria: 'Daily habit completion chart',
  chartDayAria: (
    date: string,
    completed: number,
    total: number,
    percent: number,
  ) =>
    total > 0
      ? `${date}: ${completed} of ${total} habits done, ${percent}%`
      : `${date}: no habits tracked`,
  perHabitTitle: 'Per habit',
  perHabitSubtitle: 'Habits that need attention are listed first',
  needsAttentionTitle: 'Needs attention',
  needsAttentionEmpty: 'Nothing urgent — keep the streak going.',
  openToday: 'Check in',
  openDay: 'Open day',
  reasonOpenToday: 'Still open today',
  reasonFallingBehind: 'Falling behind this range',
  reasonStreakBroken: 'Streak broken — restart today',
  insightCtaCheckIn: 'Check in on Today',
  insightCtaOpenDay: 'Open that day',
  insightOpenToday: (open: number, habitTitle?: string) =>
    open === 1
      ? habitTitle
        ? `1 habit still open today`
        : '1 habit still open today'
      : `${open} habits still open today`,
  insightOpenTodayDetail: (habitTitle: string | null, open: number) =>
    habitTitle
      ? `Start with “${habitTitle}” — check it off on Today${open > 1 ? ` (${open} left)` : ''}.`
      : 'Open Today and clear the remaining check-ins.',
  insightThinTitle: 'Habit check-ins are thin lately',
  insightThinDetail: (softDays: number, rangeDays: number) =>
    `${softDays} of the last ${rangeDays} days were under half done — protect a short block for check-ins.`,
  insightWeakTitle: (title: string, percent: number) =>
    `“${title}” is only at ${percent}%`,
  insightWeakDetail:
    'A few check-ins this week will lift the rate — open Today and mark it done.',
  insightClearedTitle: 'Habits cleared for today',
  insightClearedDetail:
    'Nice work. Keep the streak by checking in again tomorrow.',
  insightStartTitle: 'Start today’s habit check-ins',
  insightStartDetail:
    'Open Today and tick the habits that matter — trends update as you go.',
  dailyDone: (completed: number, total: number) =>
    total > 0 ? `${completed}/${total}` : '—',
} as const
