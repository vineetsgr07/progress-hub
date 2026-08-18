/** Task detail panel preferences (localStorage). */

export const TASK_DETAIL_SIZE_KEY = 'todo-task-detail-size'
export const TASK_DETAIL_NOTES_ON_TOP_KEY = 'todo-task-detail-notes-on-top'
export const TASK_DETAIL_CHECKLIST_SHARE_KEY = 'todo-task-detail-checklist-share'

export const TASK_DETAIL_CHECKLIST_SHARE_DEFAULT = 50
export const TASK_DETAIL_CHECKLIST_SHARE_MIN = 25
export const TASK_DETAIL_CHECKLIST_SHARE_MAX = 75
export const TASK_DETAIL_CHECKLIST_SHARE_NUDGE = 2

export type TaskDetailSize = 'half' | 'full'

/** Default: half-screen right panel. */
export function readTaskDetailSize(
  storage: Storage = localStorage,
): TaskDetailSize {
  const raw = storage.getItem(TASK_DETAIL_SIZE_KEY)
  if (raw === 'full') return 'full'
  return 'half'
}

export function writeTaskDetailSize(
  value: TaskDetailSize,
  storage: Storage = localStorage,
): void {
  storage.setItem(TASK_DETAIL_SIZE_KEY, value)
}

/** When true, notes sit above the checklist. Default true. */
export function readTaskDetailNotesOnTop(
  storage: Storage = localStorage,
): boolean {
  const raw = storage.getItem(TASK_DETAIL_NOTES_ON_TOP_KEY)
  if (raw === null) return true
  return raw !== '0' && raw !== 'false'
}

export function writeTaskDetailNotesOnTop(
  value: boolean,
  storage: Storage = localStorage,
): void {
  storage.setItem(TASK_DETAIL_NOTES_ON_TOP_KEY, value ? '1' : '0')
}

/** Checklist column share in full Focus Mode (percent of stack width). */
export function clampTaskDetailChecklistShare(share: number): number {
  if (!Number.isFinite(share)) return TASK_DETAIL_CHECKLIST_SHARE_DEFAULT
  return Math.min(
    TASK_DETAIL_CHECKLIST_SHARE_MAX,
    Math.max(TASK_DETAIL_CHECKLIST_SHARE_MIN, Math.round(share)),
  )
}

export function readTaskDetailChecklistShare(
  storage: Storage = localStorage,
): number {
  const raw = storage.getItem(TASK_DETAIL_CHECKLIST_SHARE_KEY)
  if (raw === null) return TASK_DETAIL_CHECKLIST_SHARE_DEFAULT
  return clampTaskDetailChecklistShare(Number(raw))
}

export function writeTaskDetailChecklistShare(
  share: number,
  storage: Storage = localStorage,
): void {
  storage.setItem(
    TASK_DETAIL_CHECKLIST_SHARE_KEY,
    String(clampTaskDetailChecklistShare(share)),
  )
}
