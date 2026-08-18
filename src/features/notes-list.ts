import type { Priority } from '../types'

export type NotesSource = 'task' | 'note'

export type NotesSubject = {
  id: string
  source: NotesSource
  title: string
  body: string
  projectTag?: string
  priority?: Priority
  pinned?: boolean
  /** Task-only: frequency / cadence for the detail peek. */
  category?: string
  cadenceWeekday?: number | null
  cadenceMonthDay?: number | null
  /** Task-only: workflow status. */
  status?: 'todo' | 'doing' | 'done'
}

export type NoteListItem = {
  id: string
  source: NotesSource
  title: string
  excerpt: string
  projectTag: string
  priority: Priority | string
  pinned: boolean
  updatedAt: string
  createdAt: string
}

export type NoteDetail = {
  id: string
  source: NotesSource
  title: string
  body: string
  projectTag: string
  priority: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export type NoteSort = 'updated' | 'priority' | 'project' | 'manual'

/** Primary soft sections on the Notes tab. Frequency is out of scope. */
export type NoteGroupBy = 'none' | 'project' | 'priority'

/** Notes tab card arrangement: multi-column grid or full-width rows. */
export type NoteLayout = 'grid' | 'list'

export type NoteLeafSection = {
  key: string
  label: string
  items: NoteListItem[]
}

export type NoteSection = {
  key: string
  label: string
  items: NoteListItem[]
}

export const NOTES_GROUP_COLLAPSED_KEY = 'todo-app.notesGroupCollapsed'
export const NOTES_LAYOUT_KEY = 'todo-app.notesLayout'

/** Sentinel for “show every project” in note filters. */
export const NOTES_PROJECT_ALL = 'All'

export const notesListCopy = {
  panelTitle: 'Notes',
  viewTitle: 'Notes',
  newNote: 'New note',
  empty: 'No notes yet. Capture an idea, or open notes on any task.',
  emptyFiltered: 'No notes match these filters.',
  loading: 'Loading notes…',
  error: 'Couldn’t load notes. Check that the app server is running, then try again.',
  retry: 'Retry',
  searchPlaceholder: 'Search notes…',
  filterProject: 'Project',
  filterPriority: 'Priority',
  filterSource: 'Source',
  sourceAll: 'All',
  sourceTask: 'From tasks',
  sourceNote: 'Standalone',
  groupByLabel: 'Group by',
  groupByNone: 'None',
  groupByProject: 'Project',
  groupByPriority: 'Priority',
  sectionCount: (n: number) => (n === 1 ? '1 note' : `${n} notes`),
  expandSection: 'Show notes',
  collapseSection: 'Hide notes',
  sortLabel: 'Sort',
  sortWithinLabel: 'Then sort',
  sortUpdated: 'Recently updated',
  sortPriority: 'Priority',
  sortProject: 'Project',
  sortManual: 'Manual order',
  dragHandle: (title: string) => `Drag to reorder ${title}`,
  reorderSaved: 'Note order saved',
  reorderFailed: 'Couldn’t save note order. Reloading…',
  showAll: 'Show all',
  hideOlder: 'Hide older',
  olderCount: (n: number) =>
    n === 1 ? '1 note older than 2 weeks' : `${n} notes older than 2 weeks`,
  olderLoading: 'Loading older notes…',
  olderEmpty: 'No older notes.',
  noRecent: 'No notes updated in the last 2 weeks.',
  cardPreviewEmpty: 'No written text yet.',
  layoutLabel: 'Layout',
  layoutGrid: 'Cards',
  layoutList: 'Rows',
  untitled: 'Untitled note',
  fromTask: 'Task',
  pin: 'Pin',
  unpin: 'Unpin',
  delete: 'Delete note',
  deleteConfirm: 'Delete this note permanently?',
  clearTaskConfirm: 'Clear notes on this task? The task itself stays.',
  count: (n: number) => (n === 1 ? '1 note' : `${n} notes`),
  recentHint: 'Updated in the last 2 weeks',
  titlePlaceholder: 'Note title',
} as const

export const NOTES_RECENT_DAYS = 14

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const PRIORITY_ORDER = ['High', 'Medium', 'Low'] as const

export function parseNoteGroupBy(raw: string | null | undefined): NoteGroupBy {
  if (raw === 'project' || raw === 'priority' || raw === 'none') return raw
  return 'none'
}

export function parseNoteLayout(raw: string | null | undefined): NoteLayout {
  if (raw === 'grid' || raw === 'list') return raw
  return 'list'
}

export function readNotesLayout(storage: Storage = localStorage): NoteLayout {
  try {
    return parseNoteLayout(storage.getItem(NOTES_LAYOUT_KEY))
  } catch {
    return 'list'
  }
}

export function writeNotesLayout(
  layout: NoteLayout,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(NOTES_LAYOUT_KEY, layout)
  } catch {
    /* ignore quota / private mode */
  }
}

export function readNotesGroupCollapsed(
  storage: Storage = localStorage,
): Record<string, boolean> {
  try {
    const raw = storage.getItem(NOTES_GROUP_COLLAPSED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

export function writeNotesGroupCollapsed(
  map: Record<string, boolean>,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(NOTES_GROUP_COLLAPSED_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

/** When sort matches the group key, order by updated inside each section. */
export function effectiveNoteSort(groupBy: NoteGroupBy, sort: NoteSort): NoteSort {
  if (groupBy === 'project' && sort === 'project') return 'updated'
  if (groupBy === 'priority' && sort === 'priority') return 'updated'
  return sort
}

function partitionByProject(items: NoteListItem[]): NoteLeafSection[] {
  const buckets = new Map<string, NoteListItem[]>()
  for (const item of items) {
    const key = item.projectTag || 'Personal'
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }
  return [...buckets.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((key) => ({ key, label: key, items: buckets.get(key)! }))
}

function partitionByPriority(items: NoteListItem[]): NoteLeafSection[] {
  const buckets = new Map<string, NoteListItem[]>()
  for (const item of items) {
    const key = String(item.priority || 'Medium')
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }
  const known = PRIORITY_ORDER.filter((p) => buckets.has(p)).map((key) => ({
    key,
    label: key,
    items: buckets.get(key)!,
  }))
  const extras = [...buckets.keys()]
    .filter((k) => !(PRIORITY_ORDER as readonly string[]).includes(k))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((key) => ({ key, label: key, items: buckets.get(key)! }))
  return [...known, ...extras]
}

/**
 * Two levels only: Group by → soft sections; Sort orders cards inside each section.
 * No nested subgroup headers.
 */
export function buildNoteSections(
  items: NoteListItem[],
  groupBy: NoteGroupBy,
  sort: NoteSort,
): NoteSection[] {
  const leafSort = effectiveNoteSort(groupBy, sort)
  if (groupBy === 'none') {
    return [
      {
        key: '__flat__',
        label: '',
        items: sortClientNotes(items, leafSort),
      },
    ]
  }

  const primary =
    groupBy === 'project' ? partitionByProject(items) : partitionByPriority(items)

  return primary.map((part) => ({
    key: part.key,
    label: part.label,
    items: sortClientNotes(part.items, leafSort),
  }))
}

export function sectionItemCount(section: NoteSection): number {
  return section.items.length
}

export function relativeUpdatedAt(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.round((now - then) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 14) return `${diffDay}d ago`
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function noteItemKey(item: {
  source: NotesSource | string
  id: string
}): string {
  return `${item.source}:${item.id}`
}

/** Apply a saved `source:id` order; unknown keys ignored; leftovers keep input order. */
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

/**
 * Reorder the visible subset inside a full order list, keeping hidden keys in place.
 * Walks `previous`; each visible slot consumes the next key from `visibleOrdered`.
 */
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

export function sortClientNotes(
  items: NoteListItem[],
  sort: NoteSort,
  manualOrder: string[] = [],
): NoteListItem[] {
  if (sort === 'manual') {
    if (manualOrder.length === 0) return items.slice()
    return applyManualNoteOrder(items, manualOrder)
  }
  const copy = items.slice()
  copy.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sort === 'priority') {
      const cmp =
        (PRIORITY_RANK[String(a.priority)] ?? 99) -
        (PRIORITY_RANK[String(b.priority)] ?? 99)
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

export function subjectFromDetail(detail: NoteDetail): NotesSubject {
  return {
    id: detail.id,
    source: detail.source,
    title: detail.title || (detail.source === 'note' ? notesListCopy.untitled : ''),
    body: detail.body,
    projectTag: detail.projectTag,
    priority: (detail.priority as Priority) || 'Medium',
    pinned: detail.pinned,
  }
}
