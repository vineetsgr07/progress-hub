import {
  clampTaskDetailChecklistShare,
  readTaskDetailChecklistShare,
  readTaskDetailNotesOnTop,
  readTaskDetailSize,
  writeTaskDetailChecklistShare,
  writeTaskDetailNotesOnTop,
  writeTaskDetailSize,
} from './task-detail-prefs'

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

assertEqual(readTaskDetailSize(store), 'half', 'default size half')
writeTaskDetailSize('full', store)
assertEqual(readTaskDetailSize(store), 'full', 'size full')
writeTaskDetailSize('half', store)
assertEqual(readTaskDetailSize(store), 'half', 'size half')
store.setItem('todo-task-detail-size', 'bogus')
assertEqual(readTaskDetailSize(store), 'half', 'invalid size falls back to half')

assertEqual(readTaskDetailNotesOnTop(store), true, 'default notes on top true')
writeTaskDetailNotesOnTop(false, store)
assertEqual(readTaskDetailNotesOnTop(store), false, 'notes on top false')
writeTaskDetailNotesOnTop(true, store)
assertEqual(readTaskDetailNotesOnTop(store), true, 'notes on top true')

assertEqual(clampTaskDetailChecklistShare(50), 50, 'clamp keeps 50')
assertEqual(clampTaskDetailChecklistShare(10), 25, 'clamp floors at 25')
assertEqual(clampTaskDetailChecklistShare(90), 75, 'clamp caps at 75')
assertEqual(clampTaskDetailChecklistShare(Number.NaN), 50, 'clamp NaN → 50')
assertEqual(readTaskDetailChecklistShare(store), 50, 'default checklist share 50')
writeTaskDetailChecklistShare(60, store)
assertEqual(readTaskDetailChecklistShare(store), 60, 'checklist share 60')
writeTaskDetailChecklistShare(5, store)
assertEqual(readTaskDetailChecklistShare(store), 25, 'write clamps low share')
store.setItem('todo-task-detail-checklist-share', 'not-a-number')
assertEqual(readTaskDetailChecklistShare(store), 50, 'invalid share falls back')

console.log('task-detail-prefs tests passed')
