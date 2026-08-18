export const timerCopy = {
  start: 'Start timer',
  stop: 'Stop timer',
  hoursLogged: 'Hours logged',
  moreSessions: (n: number) => `+${n} more`,
  overflowAria: (n: number) =>
    n === 1 ? 'Show 1 more work item' : `Show ${n} more work items`,
  overflowHeading: 'Other time today',
  overflowRemainder: (n: number, duration: string) =>
    n === 1
      ? `and 1 smaller · ${duration}`
      : `and ${n} smaller · ${duration}`,
  sessionCount: (n: number) => (n === 1 ? '1 session' : `${n} sessions`),
  sessionStripAria: 'Time spent by work item today',
  emptyStrip: 'No timed sessions yet',
  liveSuffix: ' · live',
  shareOfToday: (pct: number) => `${pct}% of today`,
  durationAndShare: (duration: string, pct: number) =>
    `${duration} · ${pct}% of today`,
  startedAt: (clock: string) => `Started ${clock}`,
} as const
