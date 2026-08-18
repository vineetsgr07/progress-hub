import type { Subtask } from '../types'

/**
 * Focus checklist order: open items first (by position), then done at the bottom.
 * Tie-break by id for stability.
 */
export function sortFocusChecklist(items: Subtask[]): Subtask[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.position !== b.position) return a.position - b.position
    return a.id.localeCompare(b.id)
  })
}

/** Open items first; done items last (already sorted). */
export function partitionChecklist(items: Subtask[]): {
  open: Subtask[]
  done: Subtask[]
} {
  const open: Subtask[] = []
  const done: Subtask[] = []
  for (const item of items) {
    if (item.done) done.push(item)
    else open.push(item)
  }
  return { open, done }
}

/** Visible rows: open only, or open then done when expanded. */
export function visibleChecklist(
  items: Subtask[],
  showDone: boolean,
): Subtask[] {
  const { open, done } = partitionChecklist(items)
  if (!showDone) return open
  return [...open, ...done]
}

/** Insert `newId` immediately after `afterId` (append if afterId missing). */
export function insertIdAfter(
  orderedIds: string[],
  afterId: string,
  newId: string,
): string[] {
  const without = orderedIds.filter((id) => id !== newId)
  const idx = without.indexOf(afterId)
  if (idx < 0) return [...without, newId]
  const next = [...without]
  next.splice(idx + 1, 0, newId)
  return next
}
