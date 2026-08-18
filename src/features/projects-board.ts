import type { Task } from '../types'
import type { TaskStatus } from './status-ui'
import { isTaskStatus } from './status-ui'
import { buildProjectSections } from './projects-sections'

export const PROJECTS_NOTES_OPEN_KEY = 'todo-app.projectsNotesOpen'

export const PROJECT_BOARD_STATUSES: TaskStatus[] = ['todo', 'doing', 'done']

export type ProjectBoardBand = {
  status: TaskStatus
  items: Task[]
}

export type ProjectBoardColumn = {
  key: string
  label: string
  items: Task[]
  bands: ProjectBoardBand[]
}

export function projectTagKey(task: Pick<Task, 'projectTag'>): string {
  return (task.projectTag || '').trim() || 'Personal'
}

export function dropId(projectKey: string, status: TaskStatus): string {
  return `proj:${projectKey}::${status}`
}

export function parseDropId(
  id: string,
): { projectKey: string; status: TaskStatus } | null {
  if (!id.startsWith('proj:')) return null
  const rest = id.slice('proj:'.length)
  const sep = rest.lastIndexOf('::')
  if (sep < 0) return null
  const projectKey = rest.slice(0, sep)
  const status = rest.slice(sep + 2)
  if (!projectKey || !isTaskStatus(status)) return null
  return { projectKey, status }
}

/** True when a droppable id is a status band (not a card). */
export function isBandDropId(id: string | number): boolean {
  return parseDropId(String(id)) !== null
}

function bandTasks(items: Task[], status: TaskStatus): Task[] {
  return items.filter((t) => {
    const s = isTaskStatus(t.status) ? t.status : 'todo'
    return s === status
  })
}

/**
 * Project columns (tag-list order + orphans), each with todo/doing/done bands.
 */
export function buildProjectBoard(
  tasks: Task[],
  projectTags: readonly string[],
): ProjectBoardColumn[] {
  return buildProjectSections(tasks, projectTags).map((section) => ({
    key: section.key,
    label: section.label,
    items: section.items,
    bands: PROJECT_BOARD_STATUSES.map((status) => ({
      status,
      items: bandTasks(section.items, status),
    })),
  }))
}

export function readProjectsNotesOpen(storage: Storage = localStorage): boolean {
  try {
    const raw = storage.getItem(PROJECTS_NOTES_OPEN_KEY)
    if (raw === null) return false
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

export function writeProjectsNotesOpen(
  open: boolean,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(PROJECTS_NOTES_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}
