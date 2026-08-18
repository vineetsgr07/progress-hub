/** Focus Mode preferences (localStorage). */

export const FOCUS_ON_START_KEY = 'todo-focus-on-start'
export const FOCUS_DURATION_MIN_KEY = 'todo-focus-duration-min'
export const FOCUS_END_AT_KEY = 'todo-focus-end-at'
export const FOCUS_TASK_ID_KEY = 'todo-focus-task-id'
export const FOCUS_NOTES_LEFT_KEY = 'todo-focus-notes-left'
export const FOCUS_END_SOUND_KEY = 'todo-focus-end-sound'
export const FOCUS_END_SOUND_DURATION_SEC_KEY = 'todo-focus-end-sound-duration-sec'

export const DEFAULT_FOCUS_DURATION_MIN = 25
export const FOCUS_DURATION_PRESETS = [15, 20, 25, 30, 45, 50] as const
export const FOCUS_EXTEND_MIN = 5

export const FOCUS_END_SOUNDS = ['off', 'soft', 'chime', 'alarm'] as const
export type FocusEndSound = (typeof FOCUS_END_SOUNDS)[number]
export const DEFAULT_FOCUS_END_SOUND: FocusEndSound = 'soft'

/** How long the end cue keeps ringing (session end + full preview). */
export const FOCUS_END_SOUND_DURATION_PRESETS_SEC = [
  30, 60, 120, 180, 300,
] as const
export type FocusEndSoundDurationSec =
  (typeof FOCUS_END_SOUND_DURATION_PRESETS_SEC)[number]
export const DEFAULT_FOCUS_END_SOUND_DURATION_SEC: FocusEndSoundDurationSec = 30

export function isFocusEndSound(value: string): value is FocusEndSound {
  return (FOCUS_END_SOUNDS as readonly string[]).includes(value)
}

export function isFocusEndSoundDurationSec(
  value: number,
): value is FocusEndSoundDurationSec {
  return (FOCUS_END_SOUND_DURATION_PRESETS_SEC as readonly number[]).includes(
    value,
  )
}

export function readFocusOnStart(storage: Storage = localStorage): boolean {
  const raw = storage.getItem(FOCUS_ON_START_KEY)
  if (raw === null) return true
  return raw !== '0' && raw !== 'false'
}

export function writeFocusOnStart(
  value: boolean,
  storage: Storage = localStorage,
): void {
  storage.setItem(FOCUS_ON_START_KEY, value ? '1' : '0')
}

export function readFocusDurationMin(storage: Storage = localStorage): number {
  const raw = storage.getItem(FOCUS_DURATION_MIN_KEY)
  if (raw === null) return DEFAULT_FOCUS_DURATION_MIN
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1 || n > 180) return DEFAULT_FOCUS_DURATION_MIN
  return Math.floor(n)
}

export function writeFocusDurationMin(
  minutes: number,
  storage: Storage = localStorage,
): void {
  const n = Math.floor(minutes)
  if (!Number.isFinite(n) || n < 1 || n > 180) return
  storage.setItem(FOCUS_DURATION_MIN_KEY, String(n))
}

/** When true, notes sit left / above; session sits right / below. */
export function readFocusNotesLeft(storage: Storage = localStorage): boolean {
  const raw = storage.getItem(FOCUS_NOTES_LEFT_KEY)
  if (raw === null) return false
  return raw === '1' || raw === 'true'
}

export function writeFocusNotesLeft(
  value: boolean,
  storage: Storage = localStorage,
): void {
  storage.setItem(FOCUS_NOTES_LEFT_KEY, value ? '1' : '0')
}

export function readFocusEndSound(storage: Storage = localStorage): FocusEndSound {
  const raw = storage.getItem(FOCUS_END_SOUND_KEY)
  if (raw === null) return DEFAULT_FOCUS_END_SOUND
  return isFocusEndSound(raw) ? raw : DEFAULT_FOCUS_END_SOUND
}

export function writeFocusEndSound(
  value: FocusEndSound,
  storage: Storage = localStorage,
): void {
  if (!isFocusEndSound(value)) return
  storage.setItem(FOCUS_END_SOUND_KEY, value)
}

export function readFocusEndSoundDurationSec(
  storage: Storage = localStorage,
): FocusEndSoundDurationSec {
  const raw = storage.getItem(FOCUS_END_SOUND_DURATION_SEC_KEY)
  if (raw === null) return DEFAULT_FOCUS_END_SOUND_DURATION_SEC
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_FOCUS_END_SOUND_DURATION_SEC
  return isFocusEndSoundDurationSec(n)
    ? n
    : DEFAULT_FOCUS_END_SOUND_DURATION_SEC
}

export function writeFocusEndSoundDurationSec(
  value: number,
  storage: Storage = localStorage,
): void {
  const n = Math.floor(value)
  if (!isFocusEndSoundDurationSec(n)) return
  storage.setItem(FOCUS_END_SOUND_DURATION_SEC_KEY, String(n))
}

export type FocusCountdownSession = {
  taskId: string
  endAt: number
}

export function readFocusCountdownSession(
  storage: Storage = sessionStorage,
): FocusCountdownSession | null {
  const taskId = storage.getItem(FOCUS_TASK_ID_KEY)
  const endRaw = storage.getItem(FOCUS_END_AT_KEY)
  if (!taskId || !endRaw) return null
  const endAt = Number(endRaw)
  if (!Number.isFinite(endAt)) return null
  return { taskId, endAt }
}

export function writeFocusCountdownSession(
  session: FocusCountdownSession,
  storage: Storage = sessionStorage,
): void {
  storage.setItem(FOCUS_TASK_ID_KEY, session.taskId)
  storage.setItem(FOCUS_END_AT_KEY, String(session.endAt))
}

export function clearFocusCountdownSession(
  storage: Storage = sessionStorage,
): void {
  storage.removeItem(FOCUS_TASK_ID_KEY)
  storage.removeItem(FOCUS_END_AT_KEY)
}
