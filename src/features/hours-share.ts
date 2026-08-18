import type { TimeSession } from '../types'

/** Percent of today's logged time for one block (1–100 when total > 0). */
export function sessionSharePercent(
  sessionHours: number,
  totalHours: number,
): number {
  if (totalHours <= 0 || sessionHours <= 0) return 0
  return Math.max(1, Math.round((sessionHours / totalHours) * 100))
}

export function liveSessionHours(session: TimeSession, tick: number): number {
  void tick
  if (!session.running) return session.hours
  const started = new Date(session.createdAt).getTime()
  if (!Number.isFinite(started)) return session.hours
  return Math.max(0, (Date.now() - started) / 3_600_000)
}

/** One strip segment = all sessions for the same task (+ checklist item). */
export type SessionBlock = {
  id: string
  taskId: string
  title: string
  projectTag: string
  priority: string
  subtaskId: string | null
  subtaskTitle: string | null
  displayHours: number
  sessionCount: number
  createdAt: string
  running: boolean
}

export function blockKey(session: TimeSession): string {
  return `${session.taskId}:${session.subtaskId ?? ''}`
}

export function aggregateSessionBlocks(
  sessions: TimeSession[],
  tick = 0,
): SessionBlock[] {
  const map = new Map<string, SessionBlock>()

  for (const s of sessions) {
    const hours = liveSessionHours(s, tick)
    if (hours <= 0 && !s.running) continue
    const id = blockKey(s)
    const existing = map.get(id)
    if (!existing) {
      map.set(id, {
        id,
        taskId: s.taskId,
        title: s.title,
        projectTag: s.projectTag,
        priority: s.priority,
        subtaskId: s.subtaskId,
        subtaskTitle: s.subtaskTitle,
        displayHours: hours,
        sessionCount: 1,
        createdAt: s.createdAt,
        running: s.running,
      })
      continue
    }
    existing.displayHours += hours
    existing.sessionCount += 1
    existing.running = existing.running || s.running
    if (s.createdAt < existing.createdAt) existing.createdAt = s.createdAt
    if (!existing.projectTag.trim() && s.projectTag.trim()) {
      existing.projectTag = s.projectTag
    }
    if (!existing.priority.trim() && s.priority.trim()) {
      existing.priority = s.priority
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.running !== b.running) return a.running ? -1 : 1
    return b.displayHours - a.displayHours
  })
}

export function blockHue(block: Pick<SessionBlock, 'id'>): string {
  let hash = 0
  for (let i = 0; i < block.id.length; i++) {
    hash = (hash * 31 + block.id.charCodeAt(i)) >>> 0
  }
  return `hsl(${hash % 360} 42% 48%)`
}

/** Local clock for “Started 2:14 PM”; null if invalid. */
export function formatStartedClock(iso: string): string | null {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
