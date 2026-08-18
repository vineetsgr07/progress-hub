import {
  clearFocusCountdownSession,
  DEFAULT_FOCUS_DURATION_MIN,
  DEFAULT_FOCUS_END_SOUND,
  DEFAULT_FOCUS_END_SOUND_DURATION_SEC,
  FOCUS_DURATION_PRESETS,
  FOCUS_END_SOUND_DURATION_PRESETS_SEC,
  FOCUS_EXTEND_MIN,
  readFocusCountdownSession,
  readFocusDurationMin,
  readFocusEndSound,
  readFocusEndSoundDurationSec,
  readFocusNotesLeft,
  readFocusOnStart,
  writeFocusCountdownSession,
  writeFocusDurationMin,
  writeFocusEndSound,
  writeFocusEndSoundDurationSec,
  writeFocusNotesLeft,
  writeFocusOnStart,
} from './focus-prefs'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
}

const store = new MemoryStorage()

assertEqual(readFocusOnStart(store), true, 'default focus-on-start true')
writeFocusOnStart(false, store)
assertEqual(readFocusOnStart(store), false, 'focus-on-start false')
writeFocusOnStart(true, store)
assertEqual(readFocusOnStart(store), true, 'focus-on-start true')

assertEqual(readFocusDurationMin(store), DEFAULT_FOCUS_DURATION_MIN, 'default duration 25')
assertEqual(FOCUS_DURATION_PRESETS.join(','), '15,20,25,30,45,50', 'presets')
assertEqual(FOCUS_EXTEND_MIN, 5, 'extend step')
writeFocusDurationMin(50, store)
assertEqual(readFocusDurationMin(store), 50, 'duration 50')
writeFocusDurationMin(0, store)
assertEqual(readFocusDurationMin(store), 50, 'invalid duration ignored')
writeFocusDurationMin(999, store)
assertEqual(readFocusDurationMin(store), 50, 'over-max duration ignored')
writeFocusDurationMin(15, store)
assertEqual(readFocusDurationMin(store), 15, 'duration 15')

assertEqual(readFocusCountdownSession(store), null, 'no session')
writeFocusCountdownSession({ taskId: 't1', endAt: 1_700_000_000_000 }, store)
const session = readFocusCountdownSession(store)
assertEqual(session?.taskId, 't1', 'session taskId')
assertEqual(session?.endAt, 1_700_000_000_000, 'session endAt')
clearFocusCountdownSession(store)
assertEqual(readFocusCountdownSession(store), null, 'cleared session')

assertEqual(readFocusNotesLeft(store), false, 'default notes left false')
writeFocusNotesLeft(true, store)
assertEqual(readFocusNotesLeft(store), true, 'notes left true')
writeFocusNotesLeft(false, store)
assertEqual(readFocusNotesLeft(store), false, 'notes left false')

assertEqual(readFocusEndSound(store), DEFAULT_FOCUS_END_SOUND, 'default end sound soft')
writeFocusEndSound('chime', store)
assertEqual(readFocusEndSound(store), 'chime', 'end sound chime')
writeFocusEndSound('alarm', store)
assertEqual(readFocusEndSound(store), 'alarm', 'end sound alarm')
writeFocusEndSound('off', store)
assertEqual(readFocusEndSound(store), 'off', 'end sound off')
store.setItem('todo-focus-end-sound', 'bogus')
assertEqual(readFocusEndSound(store), DEFAULT_FOCUS_END_SOUND, 'invalid sound falls back')

assertEqual(
  readFocusEndSoundDurationSec(store),
  DEFAULT_FOCUS_END_SOUND_DURATION_SEC,
  'default ring duration 30s',
)
assertEqual(
  FOCUS_END_SOUND_DURATION_PRESETS_SEC.join(','),
  '30,60,120,180,300',
  'ring duration presets',
)
writeFocusEndSoundDurationSec(60, store)
assertEqual(readFocusEndSoundDurationSec(store), 60, 'ring duration 60s')
writeFocusEndSoundDurationSec(180, store)
assertEqual(readFocusEndSoundDurationSec(store), 180, 'ring duration 180s')
writeFocusEndSoundDurationSec(12, store)
assertEqual(readFocusEndSoundDurationSec(store), 180, 'invalid ring duration ignored')
writeFocusEndSoundDurationSec(999, store)
assertEqual(readFocusEndSoundDurationSec(store), 180, 'over-max ring duration ignored')
store.setItem('todo-focus-end-sound-duration-sec', 'nope')
assertEqual(
  readFocusEndSoundDurationSec(store),
  DEFAULT_FOCUS_END_SOUND_DURATION_SEC,
  'invalid stored ring duration falls back',
)
writeFocusEndSoundDurationSec(300, store)
assertEqual(readFocusEndSoundDurationSec(store), 300, 'ring duration 300s')

console.log('focus-prefs tests passed')
