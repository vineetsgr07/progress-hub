import type { Task } from '../types'

export const PROJECTS_GROUP_COLLAPSED_KEY = 'todo-app.projectsGroupCollapsed'

export type ProjectSection = {
  key: string
  label: string
  items: Task[]
}

/**
 * Soft sections for the Projects chip: tag-list order first, then orphan
 * projectTags alphabetically. Every known project tag appears (empty OK).
 */
export function buildProjectSections(
  tasks: Task[],
  projectTags: readonly string[],
): ProjectSection[] {
  const buckets = new Map<string, Task[]>()
  for (const tag of projectTags) {
    const key = tag.trim()
    if (!key) continue
    if (!buckets.has(key)) buckets.set(key, [])
  }

  for (const task of tasks) {
    const key = (task.projectTag || '').trim() || 'Personal'
    const list = buckets.get(key)
    if (list) list.push(task)
    else buckets.set(key, [task])
  }

  const known = new Set(
    projectTags.map((t) => t.trim()).filter(Boolean),
  )
  const ordered: string[] = []
  for (const tag of projectTags) {
    const key = tag.trim()
    if (!key || !buckets.has(key)) continue
    if (!ordered.includes(key)) ordered.push(key)
  }
  const orphans = [...buckets.keys()]
    .filter((k) => !known.has(k))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  ordered.push(...orphans)

  return ordered.map((key) => ({
    key,
    label: key,
    items: buckets.get(key) ?? [],
  }))
}

export function sectionTaskCount(section: ProjectSection): number {
  return section.items.length
}

export function readProjectsGroupCollapsed(
  storage: Storage = localStorage,
): Record<string, boolean> {
  try {
    const raw = storage.getItem(PROJECTS_GROUP_COLLAPSED_KEY)
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

export function writeProjectsGroupCollapsed(
  map: Record<string, boolean>,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(PROJECTS_GROUP_COLLAPSED_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota / private mode */
  }
}

/** Merge a reordered section into the full task list order. */
export function mergeSectionOrder(
  allTasks: Task[],
  sectionOrderedIds: string[],
): Task[] {
  const idSet = new Set(sectionOrderedIds)
  const byId = new Map(allTasks.map((t) => [t.id, t]))
  const sectionTasks = sectionOrderedIds
    .map((id) => byId.get(id))
    .filter((t): t is Task => Boolean(t))

  const result: Task[] = []
  let inserted = false
  for (const task of allTasks) {
    if (idSet.has(task.id)) {
      if (!inserted) {
        result.push(...sectionTasks)
        inserted = true
      }
    } else {
      result.push(task)
    }
  }
  if (!inserted) result.push(...sectionTasks)
  return result.map((t, i) => ({ ...t, sortOrder: i }))
}

export function rebuildOrderedIds(
  allTasks: Task[],
  sectionOrderedIds: string[],
): string[] {
  return mergeSectionOrder(allTasks, sectionOrderedIds).map((t) => t.id)
}
