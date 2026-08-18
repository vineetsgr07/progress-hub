import {
  endAtFromNow,
  extendEndAt,
  formatCountdown,
  isCountdownDone,
  remainingMs,
  countdownRemainingFraction,
} from './focus-countdown'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const now = 1_700_000_000_000

assertEqual(endAtFromNow(25, now), now + 25 * 60_000, 'endAt 25m')
assertEqual(endAtFromNow(0, now), now, 'endAt 0')
assertEqual(remainingMs(now + 90_000, now), 90_000, 'remaining 90s')
assertEqual(remainingMs(now - 1000, now), 0, 'remaining clamped')
assertEqual(formatCountdown(90_000), '1:30', 'format 1:30')
assertEqual(formatCountdown(0), '0:00', 'format 0')
assertEqual(formatCountdown(999), '0:01', 'format ceil to 1s')
assertEqual(isCountdownDone(now, now), true, 'done at end')
assertEqual(isCountdownDone(now + 1, now), false, 'not done')
assertEqual(countdownRemainingFraction(25 * 60_000, 25), 1, 'fraction full')
assertEqual(countdownRemainingFraction(12.5 * 60_000, 25), 0.5, 'fraction half')
assertEqual(countdownRemainingFraction(0, 25), 0, 'fraction empty')
assertEqual(countdownRemainingFraction(1000, 0), 0, 'fraction zero duration')

assertEqual(extendEndAt(now + 60_000, 5, now), now + 60_000 + 5 * 60_000, 'extend live')
assertEqual(extendEndAt(now - 10_000, 5, now), now + 5 * 60_000, 'extend from ended uses now')
assertEqual(extendEndAt(now + 60_000, 0, now), now + 60_000, 'extend zero')

console.log('focus-countdown tests passed')
