import { clampNotesDrawerWidth, defaultNotesDrawerWidth } from './notes-copy'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

assertEqual(clampNotesDrawerWidth(480, 320), 320, 'clamp phone 320 forces full width')
assertEqual(clampNotesDrawerWidth(480, 375), 375, 'clamp phone 375 forces full width')
assertEqual(clampNotesDrawerWidth(200, 375), 375, 'clamp ignores undersized width on phone')
assertEqual(defaultNotesDrawerWidth(375), 375, 'default phone width is viewport')

assertEqual(clampNotesDrawerWidth(500, 1280), 500, 'desktop keeps requested width')
assertEqual(clampNotesDrawerWidth(2000, 1280), 1088, 'desktop caps at 85% viewport')
assertEqual(clampNotesDrawerWidth(100, 1280), 360, 'desktop enforces min 360')
assertEqual(defaultNotesDrawerWidth(1280), 640, 'default desktop is half viewport')

console.log('notes-drawer-width tests passed')
