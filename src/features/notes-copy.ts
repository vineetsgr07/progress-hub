export const notesCopy = {
  kicker: 'Notes',
  dialogLabel: 'Notes',
  closeBackdrop: 'Close panel',
  close: 'Close',
  cancel: 'Cancel',
  save: 'Save notes',
  saving: 'Saving…',
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saveFailed: 'Couldn’t save',
  retry: 'Retry',
  discardConfirm: 'Discard unsaved notes? Your changes will be lost.',
  resizeHandle: 'Resize panel',
  editorLabel: 'Notes',
  openNotes: 'Open notes',
  addNotes: 'Add notes',
  kanbanHasNotes: 'Open notes',
  kanbanAddNotes: 'Add notes',
} as const

export const NOTES_DRAWER_WIDTH_KEY = 'todo-app.notesDrawerWidth'
export const NOTES_DRAWER_WIDTH_MIN = 360
export const NOTES_DRAWER_WIDTH_MAX = 1200
export const NOTES_DRAWER_WIDTH_NUDGE = 16
export const NOTES_AUTOSAVE_MS = 1500

/** Narrow layout breakpoint — keep in sync with CSS `@media (max-width: 900px)`. */
export const NARROW_MAX_WIDTH = 900

export function isNarrowViewport(viewportWidth = window.innerWidth) {
  return viewportWidth <= NARROW_MAX_WIDTH
}

export function clampNotesDrawerWidth(width: number, viewportWidth = window.innerWidth) {
  if (isNarrowViewport(viewportWidth)) return viewportWidth
  const max = Math.min(
    NOTES_DRAWER_WIDTH_MAX,
    Math.floor(viewportWidth * 0.85),
    viewportWidth,
  )
  const min = Math.min(NOTES_DRAWER_WIDTH_MIN, max)
  return Math.max(min, Math.min(max, Math.round(width)))
}

export function defaultNotesDrawerWidth(viewportWidth = window.innerWidth) {
  if (isNarrowViewport(viewportWidth)) return viewportWidth
  return clampNotesDrawerWidth(Math.max(480, Math.floor(viewportWidth * 0.5)), viewportWidth)
}

export function readNotesDrawerWidth(): number {
  try {
    const raw = localStorage.getItem(NOTES_DRAWER_WIDTH_KEY)
    if (!raw) return defaultNotesDrawerWidth()
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return defaultNotesDrawerWidth()
    return clampNotesDrawerWidth(parsed)
  } catch {
    return defaultNotesDrawerWidth()
  }
}

export function writeNotesDrawerWidth(width: number) {
  try {
    localStorage.setItem(NOTES_DRAWER_WIDTH_KEY, String(clampNotesDrawerWidth(width)))
  } catch {
    /* ignore quota / private mode */
  }
}
