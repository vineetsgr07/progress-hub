/** Plain-text excerpt from HTML or plain notes for list cards. */
export function notesExcerpt(html: string, max = 220): string {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function notesHasBody(raw: string): boolean {
  return notesExcerpt(raw, 1).length > 0
}

export type NoteSource = 'task' | 'note'
export type NoteSort = 'updated' | 'priority' | 'project' | 'manual'

export type NoteListItem = {
  id: string
  source: NoteSource
  title: string
  excerpt: string
  projectTag: string
  priority: string
  pinned: boolean
  updatedAt: string
  createdAt: string
}

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

export function noteItemKey(item: { source: string; id: string }): string {
  return `${item.source}:${item.id}`
}

export function applyManualNoteOrder<T extends { id: string; source: string }>(
  items: T[],
  order: string[],
): T[] {
  if (order.length === 0) return items.slice()
  const byKey = new Map(items.map((item) => [noteItemKey(item), item]))
  const out: T[] = []
  for (const key of order) {
    const item = byKey.get(key)
    if (!item) continue
    out.push(item)
    byKey.delete(key)
  }
  for (const item of items) {
    if (byKey.has(noteItemKey(item))) out.push(item)
  }
  return out
}

export function mergeNoteOrder(
  previous: string[],
  visibleOrdered: string[],
): string[] {
  const visibleSet = new Set(visibleOrdered)
  const result: string[] = []
  let vi = 0
  for (const key of previous) {
    if (visibleSet.has(key)) {
      if (vi < visibleOrdered.length) result.push(visibleOrdered[vi++])
    } else {
      result.push(key)
    }
  }
  while (vi < visibleOrdered.length) {
    result.push(visibleOrdered[vi++])
  }
  const seen = new Set<string>()
  return result.filter((key) => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function sortNoteItems(
  items: NoteListItem[],
  sort: NoteSort,
  manualOrder: string[] = [],
): NoteListItem[] {
  if (sort === 'manual') {
    if (manualOrder.length === 0) {
      return sortNoteItems(items, 'updated')
    }
    return applyManualNoteOrder(items, manualOrder)
  }
  const copy = items.slice()
  copy.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sort === 'priority') {
      const cmp =
        (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)
      if (cmp !== 0) return cmp
    } else if (sort === 'project') {
      const cmp = a.projectTag.localeCompare(b.projectTag, undefined, {
        sensitivity: 'base',
      })
      if (cmp !== 0) return cmp
    }
    return b.updatedAt.localeCompare(a.updatedAt)
  })
  return copy
}

export function parseNoteSort(raw: string | undefined): NoteSort {
  if (
    raw === 'priority' ||
    raw === 'project' ||
    raw === 'updated' ||
    raw === 'manual'
  ) {
    return raw
  }
  return 'updated'
}

export function parseNoteSource(raw: string | undefined): NoteSource | 'all' {
  if (raw === 'task' || raw === 'note') return raw
  return 'all'
}

/** recent = updated within window; older = stale; all = no recency filter. */
export type NoteScope = 'recent' | 'older' | 'all'

export const NOTES_RECENT_DAYS = 14

export function parseNoteScope(raw: string | undefined): NoteScope {
  if (raw === 'recent' || raw === 'older' || raw === 'all') return raw
  return 'all'
}

export function notesRecentCutoff(
  now = Date.now(),
  days = NOTES_RECENT_DAYS,
): number {
  return now - days * 24 * 60 * 60 * 1000
}

export function isNoteRecent(
  updatedAt: string,
  cutoffMs = notesRecentCutoff(),
): boolean {
  const t = new Date(updatedAt).getTime()
  if (!Number.isFinite(t)) return false
  return t >= cutoffMs
}

export function filterNotesByScope<T extends { updatedAt: string }>(
  items: T[],
  scope: NoteScope,
  cutoffMs = notesRecentCutoff(),
): T[] {
  if (scope === 'all') return items
  if (scope === 'recent') {
    return items.filter((n) => isNoteRecent(n.updatedAt, cutoffMs))
  }
  return items.filter((n) => !isNoteRecent(n.updatedAt, cutoffMs))
}

export function parseNotesListOrder(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((v): v is string => typeof v === 'string' && v.includes(':'))
      .map((v) => v.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}
