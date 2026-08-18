import type { Subtask, Task } from '../types'
import { insertIdAfter } from './focus-checklist'

/** Merge a server task into the list; optionally clear other running timers (timer start). */
export function mergeTask(
  tasks: Task[],
  updated: Task,
  opts?: { clearOtherTimers?: boolean },
): Task[] {
  const next = tasks.map((t) => {
    if (t.id === updated.id) {
      return {
        ...updated,
        // Keep local subtasks if the payload somehow omitted them.
        subtasks: updated.subtasks?.length ? updated.subtasks : t.subtasks,
        subtaskProgress: updated.subtasks?.length
          ? updated.subtaskProgress
          : t.subtaskProgress,
        entry: updated.entry ?? t.entry,
      }
    }
    if (!opts?.clearOtherTimers || !t.entry?.timerStartedAt) return t
    const started = new Date(t.entry.timerStartedAt).getTime()
    const elapsed = Number.isFinite(started)
      ? Math.max(0, (Date.now() - started) / 3_600_000)
      : 0
    return {
      ...t,
      status: t.status === 'doing' ? 'todo' : t.status,
      entry: {
        ...t.entry,
        hours: t.entry.hours + elapsed,
        timerStartedAt: null,
        timerSubtaskId: null,
      },
    }
  })
  return next.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
}

export function mergeSubtask(tasks: Task[], taskId: string, updated: Subtask): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    const subtasks = (t.subtasks || []).map((s) =>
      s.id === updated.id
        ? {
            ...updated,
            // Single-subtask PATCH responses omit day hours — keep local.
            hours: updated.hours || s.hours || 0,
          }
        : s,
    )
    const done = subtasks.filter((s) => s.done).length
    return {
      ...t,
      subtasks,
      subtaskProgress: { done, total: subtasks.length },
    }
  })
}

export function appendSubtask(tasks: Task[], taskId: string, created: Subtask): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    const subtasks = [...(t.subtasks || []), { ...created, hours: created.hours ?? 0 }]
    const done = subtasks.filter((s) => s.done).length
    return {
      ...t,
      subtasks,
      subtaskProgress: { done, total: subtasks.length },
    }
  })
}

/** Append `created`, then place it immediately after `afterId` when present. */
export function insertSubtaskAfter(
  tasks: Task[],
  taskId: string,
  created: Subtask,
  afterId: string,
): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    const existing = (t.subtasks || []).filter((s) => s.id !== created.id)
    const withHours = { ...created, hours: created.hours ?? 0 }
    const byId = new Map(existing.map((s) => [s.id, s] as const))
    byId.set(withHours.id, withHours)
    const orderedIds = insertIdAfter(
      existing.map((s) => s.id),
      afterId,
      created.id,
    )
    const subtasks = orderedIds
      .map((id, i) => {
        const s = byId.get(id)
        return s ? { ...s, position: i } : null
      })
      .filter((s): s is Subtask => Boolean(s))
    const done = subtasks.filter((s) => s.done).length
    return {
      ...t,
      subtasks,
      subtaskProgress: { done, total: subtasks.length },
    }
  })
}

export function removeSubtask(tasks: Task[], taskId: string, subtaskId: string): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    const subtasks = (t.subtasks || []).filter((s) => s.id !== subtaskId)
    const done = subtasks.filter((s) => s.done).length
    return {
      ...t,
      subtasks,
      subtaskProgress: { done, total: subtasks.length },
    }
  })
}

export function patchSubtaskLocal(
  tasks: Task[],
  taskId: string,
  subtaskId: string,
  patch: Partial<Pick<Subtask, 'done' | 'title'>>,
): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    const subtasks = (t.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, ...patch } : s,
    )
    const done = subtasks.filter((s) => s.done).length
    return {
      ...t,
      subtasks,
      subtaskProgress: { done, total: subtasks.length },
    }
  })
}

/**
 * Optimistically bank + clear a running checklist timer when that item is
 * marked done (matches server stop-on-done).
 */
export function settleRunningSubtaskTimer(
  tasks: Task[],
  taskId: string,
  subtaskId: string,
): Task[] {
  return tasks.map((t) => {
    if (t.id !== taskId) return t
    if (!t.entry?.timerStartedAt || t.entry.timerSubtaskId !== subtaskId) {
      return t
    }
    const started = new Date(t.entry.timerStartedAt).getTime()
    const elapsed = Number.isFinite(started)
      ? Math.max(0, (Date.now() - started) / 3_600_000)
      : 0
    return {
      ...t,
      status: t.status === 'doing' ? 'todo' : t.status,
      entry: {
        ...t.entry,
        hours: t.entry.hours + elapsed,
        timerStartedAt: null,
        timerSubtaskId: null,
      },
      subtasks: (t.subtasks || []).map((s) =>
        s.id === subtaskId ? { ...s, hours: (s.hours ?? 0) + elapsed } : s,
      ),
    }
  })
}
